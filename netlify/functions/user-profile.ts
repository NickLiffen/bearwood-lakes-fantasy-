// GET /.netlify/functions/user-profile?userId=xxx
// Returns public profile data for a specific user including team and history

import type { Handler } from '@netlify/functions';
import { ObjectId, Db } from 'mongodb';
import { withAuth } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { PickDocument, PICKS_COLLECTION, PickHistoryDocument, PICK_HISTORY_COLLECTION } from './_shared/models/Pick';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from './_shared/models/Golfer';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from './_shared/models/Settings';
import { getWeekStart, getMonthStart, getSeasonStart } from './_shared/utils/dates';

export const handler: Handler = withAuth(async (event) => {
  try {
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'userId is required' }),
      };
    }

    // Validate ObjectId
    if (!ObjectId.isValid(userId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Invalid userId format' }),
      };
    }

    const { db } = await connectToDatabase();

    // Get user
    const user = await db
      .collection<UserDocument>(USERS_COLLECTION)
      .findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    // Get current season setting
    const seasonSetting = await db
      .collection<SettingDocument>(SETTINGS_COLLECTION)
      .findOne({ key: 'currentSeason' });
    const currentSeason = (seasonSetting?.value as number) || 2026;

    // Get user's pick for current season
    const pick = await db
      .collection<PickDocument>(PICKS_COLLECTION)
      .findOne({
        userId: new ObjectId(userId),
        season: currentSeason,
      });

    // Get pick history
    const pickHistory = await db
      .collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION)
      .find({
        userId: new ObjectId(userId),
        season: currentSeason,
      })
      .sort({ changedAt: -1 })
      .toArray();

    // If no team, return basic profile
    if (!pick) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: user._id.toString(),
              firstName: user.firstName,
              lastName: user.lastName,
              username: user.username,
              createdAt: user.createdAt,
            },
            hasTeam: false,
            team: null,
            history: [],
          },
        }),
      };
    }

    // Get golfers for this pick
    const golferIds = pick.golferIds.map((id) => new ObjectId(id));
    const golfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: golferIds } })
      .toArray();

    // Get published tournaments for current season
    const tournaments = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({
        status: { $in: ['published', 'complete'] },
        season: currentSeason,
      })
      .toArray();

    const tournamentMap = new Map(
      tournaments.map((t) => [t._id.toString(), t])
    );
    const tournamentIds = tournaments.map((t) => t._id);

    // Get all scores for these golfers from published tournaments
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({
        golferId: { $in: golferIds },
        tournamentId: { $in: tournamentIds },
      })
      .toArray();

    // Build golfer scores map
    const golferScoresMap = new Map<string, ScoreDocument[]>();
    for (const score of scores) {
      const golferId = score.golferId.toString();
      if (!golferScoresMap.has(golferId)) {
        golferScoresMap.set(golferId, []);
      }
      golferScoresMap.get(golferId)!.push(score);
    }

    // Time boundaries
    const now = new Date();
    const weekStart = getWeekStart(now);
    const monthStart = getMonthStart(now);
    const seasonStart = getSeasonStart();

    // Build golfer data with scores
    const golfersWithScores = golfers.map((golfer) => {
      const golferScores = golferScoresMap.get(golfer._id.toString()) || [];

      // Format scores with tournament info
      const formattedScores = golferScores.map((score) => {
        const tournament = tournamentMap.get(score.tournamentId.toString());
        return {
          tournamentId: score.tournamentId.toString(),
          tournamentName: tournament?.name || 'Unknown Tournament',
          position: score.position,
          basePoints: score.basePoints,
          bonusPoints: score.bonusPoints,
          multipliedPoints: score.multipliedPoints,
          scored36Plus: score.scored36Plus,
          participated: score.participated,
          tournamentDate: tournament?.startDate || new Date(),
        };
      }).sort((a, b) => new Date(b.tournamentDate).getTime() - new Date(a.tournamentDate).getTime());

      // Filter by time period
      const weekScores = formattedScores.filter((s) => new Date(s.tournamentDate) >= weekStart);
      const monthScores = formattedScores.filter((s) => new Date(s.tournamentDate) >= monthStart);
      const seasonScores = formattedScores.filter((s) => new Date(s.tournamentDate) >= seasonStart);

      // Calculate totals
      const weekPoints = weekScores.reduce((sum, s) => sum + s.multipliedPoints, 0);
      const monthPoints = monthScores.reduce((sum, s) => sum + s.multipliedPoints, 0);
      const seasonPoints = seasonScores.reduce((sum, s) => sum + s.multipliedPoints, 0);

      return {
        golfer: toGolfer(golfer),
        weekPoints,
        monthPoints,
        seasonPoints,
        weekScores,
        monthScores,
        seasonScores,
      };
    });

    // Sort by season points descending
    golfersWithScores.sort((a, b) => b.seasonPoints - a.seasonPoints);

    // Calculate team totals
    const teamTotals = {
      weekPoints: golfersWithScores.reduce((sum, g) => sum + g.weekPoints, 0),
      monthPoints: golfersWithScores.reduce((sum, g) => sum + g.monthPoints, 0),
      seasonPoints: golfersWithScores.reduce((sum, g) => sum + g.seasonPoints, 0),
      totalSpent: pick.totalSpent,
    };

    // Get all picks for ranking
    const allPicks = await db
      .collection<PickDocument>(PICKS_COLLECTION)
      .find({ season: currentSeason })
      .toArray();

    // Calculate rankings (simplified - in production this would be more efficient)
    const allUserPoints = await calculateAllUserPoints(db, allPicks, tournaments, currentSeason, weekStart, monthStart, seasonStart);
    
    const weekRank = calculateUserRank(userId, allUserPoints, 'weekPoints');
    const monthRank = calculateUserRank(userId, allUserPoints, 'monthPoints');
    const seasonRank = calculateUserRank(userId, allUserPoints, 'seasonPoints');

    // Get golfer info for history entries
    const allHistoryGolferIds = new Set<string>();
    for (const h of pickHistory) {
      for (const pid of h.golferIds) {
        allHistoryGolferIds.add(pid.toString());
      }
    }
    
    const historyGolfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: Array.from(allHistoryGolferIds).map(id => new ObjectId(id)) } })
      .toArray();
    
    const historyGolferMap = new Map(historyGolfers.map(g => [g._id.toString(), g]));

    // Format history with golfer names
    const formattedHistory = pickHistory.map((h, index) => {
      const previousHistory = pickHistory[index + 1];
      const previousGolferIds = previousHistory ? new Set(previousHistory.golferIds.map(id => id.toString())) : new Set<string>();
      const currentGolferIds = new Set(h.golferIds.map(id => id.toString()));
      
      const addedGolfers: Array<{ id: string; name: string }> = [];
      const removedGolfers: Array<{ id: string; name: string }> = [];
      
      // Find added golfers
      for (const pid of currentGolferIds) {
        if (!previousGolferIds.has(pid)) {
          const golfer = historyGolferMap.get(pid);
          if (golfer) {
            addedGolfers.push({ id: pid, name: `${golfer.firstName} ${golfer.lastName}` });
          }
        }
      }
      
      // Find removed golfers (only if there was a previous entry)
      if (previousHistory) {
        for (const pid of previousGolferIds) {
          if (!currentGolferIds.has(pid)) {
            const golfer = historyGolferMap.get(pid);
            if (golfer) {
              removedGolfers.push({ id: pid, name: `${golfer.firstName} ${golfer.lastName}` });
            }
          }
        }
      }

      return {
        changedAt: h.changedAt,
        reason: h.reason,
        totalSpent: h.totalSpent,
        golferCount: h.golferIds.length,
        addedGolfers,
        removedGolfers,
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          user: {
            id: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            createdAt: user.createdAt,
          },
          hasTeam: true,
          stats: {
            weekPoints: teamTotals.weekPoints,
            monthPoints: teamTotals.monthPoints,
            seasonPoints: teamTotals.seasonPoints,
            weekRank,
            monthRank,
            seasonRank,
          },
          team: {
            golfers: golfersWithScores,
            totals: teamTotals,
            createdAt: pick.createdAt,
            updatedAt: pick.updatedAt,
          },
          history: formattedHistory,
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user profile';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});

// Helper to calculate all user points for ranking
async function calculateAllUserPoints(
  db: Db,
  picks: PickDocument[],
  tournaments: TournamentDocument[],
  _currentSeason: number,
  weekStart: Date,
  monthStart: Date,
  seasonStart: Date
): Promise<Map<string, { weekPoints: number; monthPoints: number; seasonPoints: number }>> {
  const allGolferIds = new Set<string>();
  for (const pick of picks) {
    for (const golferId of pick.golferIds) {
      allGolferIds.add(golferId.toString());
    }
  }

  const tournamentIds = tournaments.map(t => t._id);
  const tournamentDates = new Map(tournaments.map(t => [t._id.toString(), new Date(t.startDate)]));

  const scores: ScoreDocument[] = await db
    .collection(SCORES_COLLECTION)
    .find({
      golferId: { $in: Array.from(allGolferIds).map(id => new ObjectId(id)) },
      tournamentId: { $in: tournamentIds },
    })
    .toArray() as ScoreDocument[];

  // Score lookup
  const scoresByGolferTournament = new Map<string, Map<string, ScoreDocument>>();
  for (const score of scores) {
    const golferId = score.golferId.toString();
    if (!scoresByGolferTournament.has(golferId)) {
      scoresByGolferTournament.set(golferId, new Map());
    }
    scoresByGolferTournament.get(golferId)!.set(score.tournamentId.toString(), score);
  }

  const result = new Map<string, { weekPoints: number; monthPoints: number; seasonPoints: number }>();

  for (const pick of picks) {
    let weekPoints = 0;
    let monthPoints = 0;
    let seasonPoints = 0;

    for (const golferId of pick.golferIds) {
      const golferScores = scoresByGolferTournament.get(golferId.toString());
      if (!golferScores) continue;

      for (const [tournamentId, score] of golferScores) {
        const tournamentDate = tournamentDates.get(tournamentId);
        if (!tournamentDate) continue;

        const points = score.multipliedPoints || 0;

        if (tournamentDate >= seasonStart) seasonPoints += points;
        if (tournamentDate >= monthStart) monthPoints += points;
        if (tournamentDate >= weekStart) weekPoints += points;
      }
    }

    result.set(pick.userId.toString(), { weekPoints, monthPoints, seasonPoints });
  }

  return result;
}

// Calculate rank for a specific user
function calculateUserRank(
  userId: string,
  allPoints: Map<string, { weekPoints: number; monthPoints: number; seasonPoints: number }>,
  period: 'weekPoints' | 'monthPoints' | 'seasonPoints'
): number | null {
  const entries = Array.from(allPoints.entries())
    .map(([id, points]) => ({ id, points: points[period] }))
    .sort((a, b) => b.points - a.points);

  const index = entries.findIndex(e => e.id === userId);
  return index >= 0 ? index + 1 : null;
}
