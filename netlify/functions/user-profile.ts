// GET /.netlify/functions/user-profile?userId=xxx
// Returns public profile data for a specific user including team and history

import type { Handler } from '@netlify/functions';
import { ObjectId, Db } from 'mongodb';
import { withVerifiedAuth } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import {
  PickDocument,
  PICKS_COLLECTION,
  PickHistoryDocument,
  PICK_HISTORY_COLLECTION,
} from './_shared/models/Pick';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from './_shared/models/Golfer';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import {
  getWeekStart,
  getMonthStart,
  getMonthEnd,
  getSeasonStart,
  getTeamEffectiveStartDate,
  getWeekEnd,
  getGameweekNumber,
  getFirstGameweekStart,
} from './_shared/utils/dates';
import { calculatePickPoints, calculateGolferContribution, getRosterForGameweek, type RosterSnapshot } from './_shared/utils/scoring';
import type { TimeBoundaries } from './_shared/utils/scoring';
import { getActiveSeason } from './_shared/services/seasons.service';
import { applyPendingChanges } from './_shared/services/picks.service';

export const handler: Handler = withVerifiedAuth(async (event) => {
  try {
    const userId = event.queryStringParameters?.userId;
    const dateParam = event.queryStringParameters?.date;

    // Parse date parameter for selecting a specific week
    let targetDate = new Date();
    if (dateParam) {
      const parsed = new Date(dateParam);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      }
    }

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

    // Get current season
    const activeSeason = await getActiveSeason();
    const currentSeason = activeSeason
      ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
      : new Date().getFullYear();
    const firstGW = activeSeason?.firstGameweekStart
      ? new Date(activeSeason.firstGameweekStart)
      : null;

    // Apply any pending transfers from previous gameweeks before reading picks
    await applyPendingChanges(userId);

    // Get user's pick for current season
    const pick = await db.collection<PickDocument>(PICKS_COLLECTION).findOne({
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

    // Get golfers for this pick — use allGolferIds to cover historical roster
    const scoreGolferIds = (pick.allGolferIds && pick.allGolferIds.length > 0)
      ? pick.allGolferIds.map((id) => new ObjectId(id))
      : pick.golferIds.map((id) => new ObjectId(id));

    // Convert gameweekRosters for scoring helpers
    let gameweekRosters: Record<string, RosterSnapshot> | null = null;
    if (pick.gameweekRosters && Object.keys(pick.gameweekRosters).length > 0) {
      gameweekRosters = {};
      for (const [gw, roster] of Object.entries(pick.gameweekRosters)) {
        gameweekRosters[gw] = {
          golferIds: roster.golferIds.map((id) => id.toString()),
          captainId: roster.captainId?.toString() || null,
        };
      }
    }

    // Time boundaries - use targetDate for week calculations
    const weekStart = getWeekStart(targetDate, firstGW);
    const weekEnd = getWeekEnd(weekStart, firstGW);

    // Hoist seasonStartDate once — used by both roster selection and scoring
    const seasonStartDate = activeSeason?.startDate ? new Date(activeSeason.startDate) : null;
    const seasonFirstSat = seasonStartDate
      ? getFirstGameweekStart(seasonStartDate, firstGW)
      : getWeekStart(new Date(), firstGW);

    // Determine which golfers to display — use the selected week's roster if available
    let displayGolferIds: ObjectId[];
    let displayCaptainId: string | null | undefined = pick.captainId?.toString();

    if (gameweekRosters) {
      const selectedGW = getGameweekNumber(
        weekStart,
        seasonStartDate || seasonFirstSat,
        firstGW
      );
      const roster = getRosterForGameweek(gameweekRosters, selectedGW);
      if (roster) {
        displayGolferIds = roster.golferIds.map((id) => new ObjectId(id));
        displayCaptainId = roster.captainId;
      } else {
        displayGolferIds = pick.golferIds.map((id) => new ObjectId(id));
      }
    } else {
      displayGolferIds = pick.golferIds.map((id) => new ObjectId(id));
    }

    const golfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: displayGolferIds } })
      .toArray();

    // Get published tournaments for current season
    const tournaments = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({
        status: { $in: ['published', 'complete'] },
        season: currentSeason,
      })
      .toArray();

    const tournamentMap = new Map(tournaments.map((t) => [t._id.toString(), t]));
    const tournamentIds = tournaments.map((t) => t._id);

    // Get scores for ALL historical golfers (not just current roster)
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({
        golferId: { $in: scoreGolferIds },
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

    // Anchor month boundaries to the selected week so stats remain consistent
    // when navigating with ?date=.
    const monthStart = getMonthStart(weekStart);
    const monthEnd = getMonthEnd(weekStart);
    const seasonStart = getSeasonStart(currentSeason);

    // Team can only earn points from tournaments after team creation
    const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt, firstGW);

    const boundaries: TimeBoundaries = { weekStart, weekEnd, monthStart, monthEnd, seasonStart };

    // Pre-compute tournament dates lookup for roster-membership filtering
    const tournamentDates = new Map(
      tournaments.map((t) => [t._id.toString(), new Date(t.startDate)])
    );

    // Build golfer data with scores — use roster-aware scoring
    const captainIdString = displayCaptainId?.toString();
    const hasRosters = gameweekRosters && Object.keys(gameweekRosters).length > 0;
    const golfersWithScores = golfers.map((golfer) => {
      const golferIdStr = golfer._id.toString();
      const golferScores = golferScoresMap.get(golferIdStr) || [];
      const isCaptain = golferIdStr === captainIdString;

      // Format scores with tournament info
      const formattedScores = golferScores
        .map((score) => {
          const tournament = tournamentMap.get(score.tournamentId.toString());
          return {
            tournamentId: score.tournamentId.toString(),
            tournamentName: tournament?.name || 'Unknown Tournament',
            tournamentType: tournament?.tournamentType || 'rollup_stableford',
            scoringFormat: tournament?.scoringFormat || 'stableford',
            multiplier: tournament?.multiplier ?? 1,
            position: score.position,
            basePoints: score.basePoints,
            bonusPoints: score.bonusPoints,
            multipliedPoints: score.multipliedPoints,
            rawScore: score.rawScore,
            participated: score.participated,
            tournamentDate: tournament?.startDate || new Date(),
          };
        })
        .sort(
          (a, b) => new Date(b.tournamentDate).getTime() - new Date(a.tournamentDate).getTime()
        );

      // Filter by time period — also check roster membership so score lists
      // stay consistent with the roster-aware point totals.
      const weekScores = formattedScores.filter((s) => {
        const date = new Date(s.tournamentDate);
        if (date < weekStart || date > weekEnd || date < teamEffectiveStart) return false;
        if (hasRosters) {
          const gw = getGameweekNumber(
            getWeekStart(date, firstGW),
            seasonStartDate || seasonFirstSat,
            firstGW
          );
          const roster = getRosterForGameweek(gameweekRosters!, gw);
          if (!roster || !roster.golferIds.includes(golferIdStr)) return false;
        }
        return true;
      });
      const monthScores = formattedScores.filter((s) => {
        const date = new Date(s.tournamentDate);
        if (date < monthStart || date > monthEnd || date < teamEffectiveStart) return false;
        if (hasRosters) {
          const gw = getGameweekNumber(
            getWeekStart(date, firstGW),
            seasonStartDate || seasonFirstSat,
            firstGW
          );
          const roster = getRosterForGameweek(gameweekRosters!, gw);
          if (!roster || !roster.golferIds.includes(golferIdStr)) return false;
        }
        return true;
      });
      const seasonScores = formattedScores.filter((s) => {
        const date = new Date(s.tournamentDate);
        if (date < seasonStart || date < teamEffectiveStart) return false;
        if (hasRosters) {
          const gw = getGameweekNumber(
            getWeekStart(date, firstGW),
            seasonStartDate || seasonFirstSat,
            firstGW
          );
          const roster = getRosterForGameweek(gameweekRosters!, gw);
          if (!roster || !roster.golferIds.includes(golferIdStr)) return false;
        }
        return true;
      });

      // Calculate totals using roster-aware scorer
      const { weekPoints, monthPoints, seasonPoints } = calculateGolferContribution(
        golferScores,
        tournamentDates,
        boundaries,
        isCaptain,
        teamEffectiveStart,
        gameweekRosters,
        golferIdStr,
        firstGW,
        seasonStartDate
      );

      return {
        golfer: toGolfer(golfer),
        isCaptain,
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
    const allUserPoints = await calculateAllUserPoints(
      db,
      allPicks,
      tournaments,
      currentSeason,
      boundaries,
      firstGW,
      activeSeason?.startDate ? new Date(activeSeason.startDate) : null
    );

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
      .find({ _id: { $in: Array.from(allHistoryGolferIds).map((id) => new ObjectId(id)) } })
      .toArray();

    const historyGolferMap = new Map(historyGolfers.map((g) => [g._id.toString(), g]));

    // Format history with golfer names
    const formattedHistory = pickHistory.map((h, index) => {
      const previousHistory = pickHistory[index + 1];
      const previousGolferIds = previousHistory
        ? new Set(previousHistory.golferIds.map((id) => id.toString()))
        : new Set<string>();
      const currentGolferIds = new Set(h.golferIds.map((id) => id.toString()));

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

    // Filter to only show entries where transfers actually happened
    const filteredHistory = formattedHistory.filter(
      (h) => h.addedGolfers.length > 0 || h.removedGolfers.length > 0
    );

    // Calculate period navigation info
    const currentWeek = getWeekStart(new Date(), firstGW);
    // Use teamEffectiveStart for navigation - can only go back to first week team could earn points
    const hasPrevious = weekStart > teamEffectiveStart;
    const hasNext = weekStart < currentWeek;

    // Format week label
    const formatWeekLabel = (date: Date) => {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };

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
          period: {
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            label: formatWeekLabel(weekStart),
            hasPrevious,
            hasNext,
          },
          teamCreatedAt: pick.createdAt,
          teamEffectiveStart: teamEffectiveStart.toISOString(),
          captainId: displayCaptainId || null,
          history: filteredHistory,
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
  boundaries: TimeBoundaries,
  firstGW?: Date | null,
  seasonStartDate?: Date | null
): Promise<Map<string, { weekPoints: number; monthPoints: number; seasonPoints: number }>> {
  // Collect ALL historical golfer IDs (not just current roster)
  const allGolferIds = new Set<string>();
  for (const pick of picks) {
    const ids =
      pick.allGolferIds && pick.allGolferIds.length > 0 ? pick.allGolferIds : pick.golferIds;
    for (const golferId of ids) {
      allGolferIds.add(golferId.toString());
    }
  }

  const tournamentIds = tournaments.map((t) => t._id);
  const tournamentDates = new Map(
    tournaments.map((t) => [t._id.toString(), new Date(t.startDate)])
  );

  const scores: ScoreDocument[] = (await db
    .collection(SCORES_COLLECTION)
    .find({
      golferId: { $in: Array.from(allGolferIds).map((id) => new ObjectId(id)) },
      tournamentId: { $in: tournamentIds },
    })
    .toArray()) as ScoreDocument[];

  // Score lookup
  const scoresByGolferTournament = new Map<string, Map<string, ScoreDocument>>();
  for (const score of scores) {
    const golferId = score.golferId.toString();
    if (!scoresByGolferTournament.has(golferId)) {
      scoresByGolferTournament.set(golferId, new Map());
    }
    scoresByGolferTournament.get(golferId)!.set(score.tournamentId.toString(), score);
  }

  const result = new Map<
    string,
    { weekPoints: number; monthPoints: number; seasonPoints: number }
  >();

  for (const pick of picks) {
    // Convert gameweekRosters from ObjectIds to string-based RosterSnapshots
    let gameweekRosters: Record<string, RosterSnapshot> | undefined;
    if (pick.gameweekRosters && Object.keys(pick.gameweekRosters).length > 0) {
      gameweekRosters = {};
      for (const [gw, roster] of Object.entries(pick.gameweekRosters)) {
        gameweekRosters[gw] = {
          golferIds: roster.golferIds.map((id) => id.toString()),
          captainId: roster.captainId?.toString() || null,
        };
      }
    }

    const pickAllIds =
      pick.allGolferIds && pick.allGolferIds.length > 0 ? pick.allGolferIds : pick.golferIds;

    const points = calculatePickPoints(
      {
        golferIds: pick.golferIds,
        captainId: pick.captainId,
        createdAt: pick.createdAt,
        gameweekRosters,
        allGolferIds: pickAllIds,
      },
      scoresByGolferTournament,
      tournamentDates,
      boundaries,
      firstGW,
      seasonStartDate
    );
    result.set(pick.userId.toString(), points);
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

  const index = entries.findIndex((e) => e.id === userId);
  return index >= 0 ? index + 1 : null;
}
