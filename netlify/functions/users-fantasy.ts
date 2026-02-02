// GET /.netlify/functions/users-fantasy
// Returns all users with their fantasy stats (points, ranks, team info)

import type { Handler } from '@netlify/functions';
import { ObjectId } from 'mongodb';
import { withAuth } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from './_shared/models/Settings';
import { getWeekStart, getMonthStart, getSeasonStart, getTeamEffectiveStartDate } from './_shared/utils/dates';

interface FantasyUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  hasTeam: boolean;
  teamSize: number;
  totalSpent: number;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekRank: number | null;
  monthRank: number | null;
  seasonRank: number | null;
  createdAt: Date;
}

export const handler: Handler = withAuth(async () => {
  try {
    const { db } = await connectToDatabase();

    // Get current season setting first (needed for other queries)
    const seasonSetting = await db
      .collection<SettingDocument>(SETTINGS_COLLECTION)
      .findOne({ key: 'currentSeason' });
    const currentSeason = (seasonSetting?.value as number) || 2026;

    // Parallelize independent queries for faster response
    const [users, picks, tournaments] = await Promise.all([
      db.collection<UserDocument>(USERS_COLLECTION).find({}).toArray(),
      db.collection<PickDocument>(PICKS_COLLECTION).find({ season: currentSeason }).toArray(),
      db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION).find({
        status: { $in: ['published', 'complete'] },
        season: currentSeason,
      }).toArray(),
    ]);

    const pickMap = new Map(picks.map(p => [p.userId.toString(), p]));

    // Get all golfer IDs from picks
    const allGolferIds = new Set<string>();
    for (const pick of picks) {
      for (const golferId of pick.golferIds) {
        allGolferIds.add(golferId.toString());
      }
    }

    const tournamentIds = tournaments.map(t => t._id);

    // Get all scores for golfers in picks
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({
        golferId: { $in: Array.from(allGolferIds).map(id => new ObjectId(id)) },
        tournamentId: { $in: tournamentIds },
      })
      .toArray();

    // Create score lookup by golfer and tournament
    const scoresByGolferTournament = new Map<string, Map<string, ScoreDocument>>();
    for (const score of scores) {
      const golferId = score.golferId.toString();
      if (!scoresByGolferTournament.has(golferId)) {
        scoresByGolferTournament.set(golferId, new Map());
      }
      scoresByGolferTournament.get(golferId)!.set(score.tournamentId.toString(), score);
    }

    // Create tournament date lookup
    const tournamentDates = new Map(
      tournaments.map(t => [t._id.toString(), new Date(t.startDate)])
    );

    // Time boundaries
    const now = new Date();
    const weekStart = getWeekStart(now);
    const monthStart = getMonthStart(now);
    const seasonStart = getSeasonStart();

    // Calculate points for each user
    interface UserPoints {
      userId: string;
      weekPoints: number;
      monthPoints: number;
      seasonPoints: number;
    }

    const userPointsList: UserPoints[] = [];

    for (const user of users) {
      const pick = pickMap.get(user._id.toString());
      
      if (!pick) {
        userPointsList.push({
          userId: user._id.toString(),
          weekPoints: 0,
          monthPoints: 0,
          seasonPoints: 0,
        });
        continue;
      }

      let weekPoints = 0;
      let monthPoints = 0;
      let seasonPoints = 0;

      // Team only earns points from tournaments starting on or after their effective start date
      const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt);

      for (const golferId of pick.golferIds) {
        const golferScores = scoresByGolferTournament.get(golferId.toString());
        if (!golferScores) continue;

        for (const [tournamentId, score] of golferScores) {
          const tournamentDate = tournamentDates.get(tournamentId);
          if (!tournamentDate) continue;

          // Skip tournaments before team's effective start date
          if (tournamentDate < teamEffectiveStart) continue;

          const points = score.multipliedPoints || 0;

          if (tournamentDate >= seasonStart) {
            seasonPoints += points;
          }
          if (tournamentDate >= monthStart) {
            monthPoints += points;
          }
          if (tournamentDate >= weekStart) {
            weekPoints += points;
          }
        }
      }

      userPointsList.push({
        userId: user._id.toString(),
        weekPoints,
        monthPoints,
        seasonPoints,
      });
    }

    // Calculate ranks
    const weekRanks = [...userPointsList]
      .filter(u => pickMap.has(u.userId))
      .sort((a, b) => b.weekPoints - a.weekPoints);
    const monthRanks = [...userPointsList]
      .filter(u => pickMap.has(u.userId))
      .sort((a, b) => b.monthPoints - a.monthPoints);
    const seasonRanks = [...userPointsList]
      .filter(u => pickMap.has(u.userId))
      .sort((a, b) => b.seasonPoints - a.seasonPoints);

    const weekRankMap = new Map(weekRanks.map((u, i) => [u.userId, i + 1]));
    const monthRankMap = new Map(monthRanks.map((u, i) => [u.userId, i + 1]));
    const seasonRankMap = new Map(seasonRanks.map((u, i) => [u.userId, i + 1]));

    // Build response
    const fantasyUsers: FantasyUser[] = users.map(user => {
      const userId = user._id.toString();
      const pick = pickMap.get(userId);
      const points = userPointsList.find(u => u.userId === userId)!;
      const hasTeam = !!pick;

      return {
        id: userId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        hasTeam,
        teamSize: pick?.golferIds.length || 0,
        totalSpent: pick?.totalSpent || 0,
        weekPoints: points.weekPoints,
        monthPoints: points.monthPoints,
        seasonPoints: points.seasonPoints,
        weekRank: hasTeam ? weekRankMap.get(userId) || null : null,
        monthRank: hasTeam ? monthRankMap.get(userId) || null : null,
        seasonRank: hasTeam ? seasonRankMap.get(userId) || null : null,
        createdAt: user.createdAt,
      };
    });

    // Sort by season points (descending) by default
    fantasyUsers.sort((a, b) => b.seasonPoints - a.seasonPoints);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: fantasyUsers,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
