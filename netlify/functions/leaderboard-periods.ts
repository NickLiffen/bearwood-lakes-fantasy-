// GET /.netlify/functions/leaderboard-periods
// Returns leaderboard data for specific periods (week/month/season) with navigation

import type { Handler } from '@netlify/functions';
import { withVerifiedAuth } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { getActiveSeason, getSeasonByName } from './_shared/services/seasons.service';
import {
  getWeekStart,
  getMonthStart,
  getGameweekNumber,
  getWeekEnd as getWeekEndShared,
  getMonthEnd,
  getFirstGameweekStart,
  getNextWeekStart,
} from './_shared/utils/dates';
import { getRedisClient, getRedisKeyPrefix } from './_shared/rateLimit';
import {
  calculateLeaderboard,
  rankEntries,
  formatWeekLabel,
  formatMonthLabel,
  type RankedLeaderboardEntry,
} from './_shared/utils/leaderboard-calculator';
import { applyAllPendingChanges } from './_shared/services/picks.service';

const PERIODS_CACHE_TTL = 60; // 60 seconds

function periodsCacheKey(action: string, season: string, period?: string, date?: string): string {
  const parts = [getRedisKeyPrefix(), 'v1:cache:leaderboard-periods', season, action];
  if (period) parts.push(period);
  if (date) parts.push(date);
  return parts.join(':');
}

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    return null;
  }
}

async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(key, JSON.stringify(data), 'EX', PERIODS_CACHE_TTL);
  } catch {
    // Redis unavailable — continue without caching
  }
}

interface PeriodInfo {
  type: 'week' | 'month' | 'season';
  startDate: string;
  endDate: string;
  label: string;
  gameweek?: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

interface LeaderboardResponse {
  entries: RankedLeaderboardEntry[];
  period: PeriodInfo | null;
  tournamentCount: number;
}

interface LeadersResponse {
  weeklyLeader: RankedLeaderboardEntry | null;
  monthlyLeader: RankedLeaderboardEntry | null;
  seasonLeader: RankedLeaderboardEntry | null;
  currentWeek: PeriodInfo;
  currentMonth: PeriodInfo;
  seasonInfo: PeriodInfo;
}

function getWeekEnd(date: Date, firstGameweekStart?: Date | null): Date {
  const weekStart = getWeekStart(date, firstGameweekStart);
  return getWeekEndShared(weekStart, firstGameweekStart);
}

export const handler: Handler = withVerifiedAuth(async (event) => {
  try {
    // Get query params
    const period = event.queryStringParameters?.period || 'week';
    const dateParam = event.queryStringParameters?.date;
    const action = event.queryStringParameters?.action;
    const seasonParam = event.queryStringParameters?.season;

    // Check Redis cache first
    const cacheKey = periodsCacheKey(action || period, seasonParam || 'active', period, dateParam);
    const cached = await getCached<unknown>(cacheKey);
    if (cached) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: cached }),
      };
    }

    const { db } = await connectToDatabase();

    // Apply any pending transfers before computing the leaderboard
    await applyAllPendingChanges();

    // Get season — use explicit season param or fall back to active season
    const activeSeason = seasonParam ? await getSeasonByName(seasonParam) : await getActiveSeason();
    const fallbackYear = new Date().getFullYear();
    const seasonStartDate = activeSeason
      ? new Date(activeSeason.startDate)
      : new Date(`${fallbackYear}-01-01`);
    const seasonEndDate = activeSeason
      ? new Date(activeSeason.endDate)
      : new Date(`${fallbackYear}-12-31`);
    seasonEndDate.setHours(23, 59, 59, 999);

    const currentSeason = activeSeason ? parseInt(activeSeason.name) || fallbackYear : fallbackYear;
    const firstGW = activeSeason?.firstGameweekStart
      ? new Date(activeSeason.firstGameweekStart)
      : null;

    const picks = await db
      .collection<PickDocument>(PICKS_COLLECTION)
      .find({ season: currentSeason })
      .project({ userId: 1, golferIds: 1, captainId: 1, totalSpent: 1, createdAt: 1, gameweekRosters: 1, allGolferIds: 1 })
      .toArray();

    const now = new Date();

    if (picks.length === 0) {
      if (action === 'leaders') {
        const weekStart = getWeekStart(now, firstGW);
        const weekEnd = getWeekEnd(now, firstGW);
        const monthStart = getMonthStart(now);
        const monthEnd = getMonthEnd(now);

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            data: {
              weeklyLeader: null,
              monthlyLeader: null,
              seasonLeader: null,
              currentWeek: {
                type: 'week',
                startDate: weekStart.toISOString(),
                endDate: weekEnd.toISOString(),
                label: formatWeekLabel(
                  weekStart,
                  weekEnd,
                  getGameweekNumber(weekStart, seasonStartDate, firstGW)
                ),
                gameweek: getGameweekNumber(weekStart, seasonStartDate, firstGW),
                hasPrevious: weekStart > getFirstGameweekStart(seasonStartDate, firstGW),
                hasNext: false,
              },
              currentMonth: {
                type: 'month',
                startDate: monthStart.toISOString(),
                endDate: monthEnd.toISOString(),
                label: formatMonthLabel(monthStart),
                hasPrevious: monthStart > getFirstGameweekStart(seasonStartDate, firstGW),
                hasNext: false,
              },
              seasonInfo: {
                type: 'season',
                startDate: seasonStartDate.toISOString(),
                endDate: seasonEndDate.toISOString(),
                label: `${currentSeason} Season`,
                hasPrevious: false,
                hasNext: false,
              },
            },
          }),
        };
      }
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          data: { entries: [], period: null, tournamentCount: 0 },
        }),
      };
    }

    // Get user details
    const userIds = picks.map((p) => p.userId);
    const users = await db
      .collection<UserDocument>(USERS_COLLECTION)
      .find({ _id: { $in: userIds } })
      .project({ passwordHash: 0 })
      .toArray();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    // Get all published or complete tournaments within season
    const publishedTournaments = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({
        season: currentSeason,
        status: { $in: ['published', 'complete'] },
      })
      .project({ _id: 1, startDate: 1, status: 1, season: 1, name: 1 })
      .toArray();

    // Filter to only those within season dates
    const seasonTournaments = publishedTournaments.filter((t) => {
      const startDate = new Date(t.startDate);
      return startDate >= seasonStartDate && startDate <= seasonEndDate;
    });

    const tournamentIds = seasonTournaments.map((t) => t._id);

    // Get all scores
    const allScores =
      tournamentIds.length > 0
        ? await db
            .collection<ScoreDocument>(SCORES_COLLECTION)
            .find({ tournamentId: { $in: tournamentIds } })
            .project({ golferId: 1, tournamentId: 1, multipliedPoints: 1, participated: 1 })
            .toArray()
        : [];

    // If requesting leaders summary
    if (action === 'leaders') {
      // Current week
      const weekStart = getWeekStart(now, firstGW);
      const weekEnd = getWeekEnd(now, firstGW);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(weekEnd);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);

      // Current month
      const monthStart = getMonthStart(now);
      const monthEnd = getMonthEnd(now);
      const prevMonthStart = getMonthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const prevMonthEnd = getMonthEnd(new Date(now.getFullYear(), now.getMonth() - 1, 1));

      // Calculate all leaderboards
      const weekData = await calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        weekStart,
        weekEnd,
        firstGW,
        undefined,
        seasonStartDate
      );
      const prevWeekData = await calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        prevWeekStart,
        prevWeekEnd,
        firstGW,
        undefined,
        seasonStartDate
      );
      const monthData = await calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        monthStart,
        monthEnd,
        firstGW,
        undefined,
        seasonStartDate
      );
      const prevMonthData = await calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        prevMonthStart,
        prevMonthEnd,
        firstGW,
        undefined,
        seasonStartDate
      );
      const seasonData = await calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        seasonStartDate,
        seasonEndDate,
        firstGW,
        undefined,
        seasonStartDate
      );

      const weekRanked = rankEntries(weekData.entries, prevWeekData.entries);
      const monthRanked = rankEntries(monthData.entries, prevMonthData.entries);
      const seasonRanked = rankEntries(seasonData.entries, null);

      const response: LeadersResponse = {
        weeklyLeader: weekRanked.find((e) => e.rank === 1) || null,
        monthlyLeader: monthRanked.find((e) => e.rank === 1) || null,
        seasonLeader: seasonRanked.find((e) => e.rank === 1) || null,
        currentWeek: {
          type: 'week',
          startDate: weekStart.toISOString(),
          endDate: weekEnd.toISOString(),
          label: formatWeekLabel(
            weekStart,
            weekEnd,
            getGameweekNumber(weekStart, seasonStartDate, firstGW)
          ),
          gameweek: getGameweekNumber(weekStart, seasonStartDate, firstGW),
          hasPrevious: weekStart > getFirstGameweekStart(seasonStartDate, firstGW),
          hasNext: weekEnd < now,
        },
        currentMonth: {
          type: 'month',
          startDate: monthStart.toISOString(),
          endDate: monthEnd.toISOString(),
          label: formatMonthLabel(monthStart),
          hasPrevious: monthStart > getFirstGameweekStart(seasonStartDate, firstGW),
          hasNext: monthEnd < now,
        },
        seasonInfo: {
          type: 'season',
          startDate: seasonStartDate.toISOString(),
          endDate: seasonEndDate.toISOString(),
          label: `${currentSeason} Season`,
          hasPrevious: false,
          hasNext: false,
        },
      };

      await setCache(cacheKey, response);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: response }),
      };
    }

    // Calculate specific period leaderboard
    const referenceDate = dateParam ? new Date(dateParam) : new Date();
    let periodStart: Date;
    let periodEnd: Date;
    let prevPeriodStart: Date;
    let prevPeriodEnd: Date;
    let periodLabel: string;

    if (period === 'week') {
      periodStart = getWeekStart(referenceDate, firstGW);
      periodEnd = getWeekEnd(referenceDate, firstGW);
      prevPeriodStart = new Date(periodStart);
      prevPeriodStart.setDate(prevPeriodStart.getDate() - 7);
      prevPeriodEnd = new Date(periodEnd);
      prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 7);
      periodLabel = formatWeekLabel(
        periodStart,
        periodEnd,
        getGameweekNumber(periodStart, seasonStartDate, firstGW)
      );
    } else if (period === 'month') {
      periodStart = getMonthStart(referenceDate);
      periodEnd = getMonthEnd(referenceDate);
      prevPeriodStart = getMonthStart(
        new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1)
      );
      prevPeriodEnd = getMonthEnd(
        new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1)
      );
      periodLabel = formatMonthLabel(periodStart);
    } else {
      // Season
      periodStart = seasonStartDate;
      periodEnd = seasonEndDate;
      prevPeriodStart = periodStart; // No previous for season
      prevPeriodEnd = periodEnd;
      periodLabel = `${currentSeason} Season`;
    }

    // Calculate current and previous period
    const currentData = await calculateLeaderboard(
      picks,
      userMap,
      seasonTournaments,
      allScores,
      periodStart,
      periodEnd,
      firstGW,
      undefined,
      seasonStartDate
    );
    const previousData =
      period !== 'season'
        ? await calculateLeaderboard(
            picks,
            userMap,
            seasonTournaments,
            allScores,
            prevPeriodStart,
            prevPeriodEnd,
            firstGW,
            undefined,
            seasonStartDate
          )
        : null;

    const ranked = rankEntries(currentData.entries, previousData?.entries || null);

    // Determine navigation
    const firstGameweekAnchor = getFirstGameweekStart(seasonStartDate, firstGW);
    let hasPrevious = false;
    let hasNext = false;
    let previousDate: string | null = null;
    let nextDate: string | null = null;

    if (period === 'week') {
      hasPrevious = periodStart > firstGameweekAnchor;
      hasNext = periodEnd < getWeekEnd(now, firstGW);
      if (hasPrevious) {
        const prev = new Date(periodStart);
        prev.setDate(prev.getDate() - 1);
        previousDate = getWeekStart(prev, firstGW).toISOString().split('T')[0];
      }
      if (hasNext) {
        nextDate = getNextWeekStart(periodStart, firstGW).toISOString().split('T')[0];
      }
    } else if (period === 'month') {
      hasPrevious = periodStart > firstGameweekAnchor;
      hasNext = periodEnd < getMonthEnd(now);
      if (hasPrevious) {
        previousDate = new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, 1)
          .toISOString().split('T')[0];
      }
      if (hasNext) {
        nextDate = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1)
          .toISOString().split('T')[0];
      }
    }

    const response: LeaderboardResponse = {
      entries: ranked,
      period: {
        type: period as 'week' | 'month' | 'season',
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
        label: periodLabel,
        gameweek:
          period === 'week' ? getGameweekNumber(periodStart, seasonStartDate, firstGW) : undefined,
        hasPrevious,
        hasNext,
        previousDate,
        nextDate,
      },
      tournamentCount: currentData.tournamentCount,
    };

    await setCache(cacheKey, response);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: response }),
    };
  } catch (error) {
    console.error('Leaderboard periods error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch leaderboard';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
