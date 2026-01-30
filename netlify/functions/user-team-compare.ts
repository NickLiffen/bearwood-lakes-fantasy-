// GET /.netlify/functions/user-team-compare?userId=xxx
// Compares the current user's team with another user's team

import type { Handler } from '@netlify/functions';
import { ObjectId } from 'mongodb';
import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from './_shared/models/Golfer';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from './_shared/models/Settings';
import { getWeekStart, getMonthStart, getSeasonStart } from './_shared/utils/dates';

interface GolferWithPoints {
  golfer: ReturnType<typeof toGolfer>;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
}

interface TeamSummary {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  hasTeam: boolean;
  golfers: GolferWithPoints[];
  totals: {
    weekPoints: number;
    monthPoints: number;
    seasonPoints: number;
    totalSpent: number;
  };
}

export const handler: Handler = withAuth(async (event: AuthenticatedEvent) => {
  try {
    const targetUserId = event.queryStringParameters?.userId;
    const currentUserId = event.user.userId;

    if (!targetUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'userId is required' }),
      };
    }

    if (!ObjectId.isValid(targetUserId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Invalid userId format' }),
      };
    }

    const { db } = await connectToDatabase();

    // Get current season
    const seasonSetting = await db
      .collection<SettingDocument>(SETTINGS_COLLECTION)
      .findOne({ key: 'currentSeason' });
    const currentSeason = (seasonSetting?.value as number) || 2026;

    // Get both users
    const [currentUser, targetUser] = await Promise.all([
      db.collection<UserDocument>(USERS_COLLECTION).findOne({ _id: new ObjectId(currentUserId) }),
      db.collection<UserDocument>(USERS_COLLECTION).findOne({ _id: new ObjectId(targetUserId) }),
    ]);

    if (!currentUser || !targetUser) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'User not found' }),
      };
    }

    // Get both picks
    const [currentPick, targetPick] = await Promise.all([
      db.collection<PickDocument>(PICKS_COLLECTION).findOne({
        userId: new ObjectId(currentUserId),
        season: currentSeason,
      }),
      db.collection<PickDocument>(PICKS_COLLECTION).findOne({
        userId: new ObjectId(targetUserId),
        season: currentSeason,
      }),
    ]);

    // Get all unique golfer IDs from both teams
    const allGolferIds = new Set<string>();
    if (currentPick) {
      currentPick.golferIds.forEach(id => allGolferIds.add(id.toString()));
    }
    if (targetPick) {
      targetPick.golferIds.forEach(id => allGolferIds.add(id.toString()));
    }

    // Get all golfers
    const golfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: Array.from(allGolferIds).map(id => new ObjectId(id)) } })
      .toArray();

    const golferMap = new Map(golfers.map(g => [g._id.toString(), g]));

    // Get published tournaments
    const tournaments = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({
        status: { $in: ['published', 'complete'] },
        season: currentSeason,
      })
      .toArray();

    const tournamentDates = new Map(tournaments.map(t => [t._id.toString(), new Date(t.startDate)]));
    const tournamentIds = tournaments.map(t => t._id);

    // Get all scores
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({
        golferId: { $in: Array.from(allGolferIds).map(id => new ObjectId(id)) },
        tournamentId: { $in: tournamentIds },
      })
      .toArray();

    // Build score lookup
    const scoresByGolfer = new Map<string, ScoreDocument[]>();
    for (const score of scores) {
      const golferId = score.golferId.toString();
      if (!scoresByGolfer.has(golferId)) {
        scoresByGolfer.set(golferId, []);
      }
      scoresByGolfer.get(golferId)!.push(score);
    }

    // Time boundaries
    const now = new Date();
    const weekStart = getWeekStart(now);
    const monthStart = getMonthStart(now);
    const seasonStart = getSeasonStart();

    // Helper to calculate golfer points
    function calculateGolferPoints(golferId: string): { weekPoints: number; monthPoints: number; seasonPoints: number } {
      const golferScores = scoresByGolfer.get(golferId) || [];
      let weekPoints = 0;
      let monthPoints = 0;
      let seasonPoints = 0;

      for (const score of golferScores) {
        const tournamentDate = tournamentDates.get(score.tournamentId.toString());
        if (!tournamentDate) continue;

        const points = score.multipliedPoints || 0;
        if (tournamentDate >= seasonStart) seasonPoints += points;
        if (tournamentDate >= monthStart) monthPoints += points;
        if (tournamentDate >= weekStart) weekPoints += points;
      }

      return { weekPoints, monthPoints, seasonPoints };
    }

    // Build team summaries
    function buildTeamSummary(
      user: UserDocument,
      pick: PickDocument | null
    ): TeamSummary {
      if (!pick) {
        return {
          userId: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          hasTeam: false,
          golfers: [],
          totals: { weekPoints: 0, monthPoints: 0, seasonPoints: 0, totalSpent: 0 },
        };
      }

      const golfersWithPoints: GolferWithPoints[] = pick.golferIds.map(golferId => {
        const golfer = golferMap.get(golferId.toString())!;
        const points = calculateGolferPoints(golferId.toString());
        return {
          golfer: toGolfer(golfer),
          ...points,
        };
      }).sort((a, b) => b.seasonPoints - a.seasonPoints);

      return {
        userId: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        hasTeam: true,
        golfers: golfersWithPoints,
        totals: {
          weekPoints: golfersWithPoints.reduce((sum, g) => sum + g.weekPoints, 0),
          monthPoints: golfersWithPoints.reduce((sum, g) => sum + g.monthPoints, 0),
          seasonPoints: golfersWithPoints.reduce((sum, g) => sum + g.seasonPoints, 0),
          totalSpent: pick.totalSpent,
        },
      };
    }

    const currentTeam = buildTeamSummary(currentUser, currentPick);
    const targetTeam = buildTeamSummary(targetUser, targetPick);

    // Find shared and unique golfers
    const currentGolferIds = new Set(currentPick?.golferIds.map(id => id.toString()) || []);
    const targetGolferIds = new Set(targetPick?.golferIds.map(id => id.toString()) || []);

    const sharedGolferIds = [...currentGolferIds].filter(id => targetGolferIds.has(id));
    const uniqueToCurrentIds = [...currentGolferIds].filter(id => !targetGolferIds.has(id));
    const uniqueToTargetIds = [...targetGolferIds].filter(id => !currentGolferIds.has(id));

    // Build comparison data
    const sharedGolfers = sharedGolferIds.map(id => {
      const golfer = golferMap.get(id)!;
      const points = calculateGolferPoints(id);
      return { golfer: toGolfer(golfer), ...points };
    });

    const uniqueToCurrent = uniqueToCurrentIds.map(id => {
      const golfer = golferMap.get(id)!;
      const points = calculateGolferPoints(id);
      return { golfer: toGolfer(golfer), ...points };
    });

    const uniqueToTarget = uniqueToTargetIds.map(id => {
      const golfer = golferMap.get(id)!;
      const points = calculateGolferPoints(id);
      return { golfer: toGolfer(golfer), ...points };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          currentUser: currentTeam,
          targetUser: targetTeam,
          comparison: {
            sharedGolfers,
            uniqueToCurrent,
            uniqueToTarget,
            sharedGolferCount: sharedGolfers.length,
            pointsDiff: {
              week: currentTeam.totals.weekPoints - targetTeam.totals.weekPoints,
              month: currentTeam.totals.monthPoints - targetTeam.totals.monthPoints,
              season: currentTeam.totals.seasonPoints - targetTeam.totals.seasonPoints,
            },
          },
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compare teams';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
