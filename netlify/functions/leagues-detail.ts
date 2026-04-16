// GET /.netlify/functions/leagues-detail?leagueId=X&period=week|month|season&date=ISO&season=2026

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { getLeagueById, getLeagueMembers } from './_shared/services/leagues.service';
import { connectToDatabase } from './_shared/db';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { getActiveSeason, getSeasonByName } from './_shared/services/seasons.service';
import {
  getWeekStart,
  getWeekEnd as getWeekEndUtil,
  getMonthStart,
  getMonthEnd,
  getGameweekNumber,
  getFirstGameweekStart,
  getNextWeekStart,
  formatDateString,
} from './_shared/utils/dates';
import {
  calculateLeaderboard,
  rankEntries,
  formatWeekLabel,
  formatMonthLabel,
} from './_shared/utils/leaderboard-calculator';

function getWeekEnd(date: Date, firstGameweekStart?: Date | null): Date {
  return getWeekEndUtil(date, firstGameweekStart);
}

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'GET') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const leagueId = event.queryStringParameters?.leagueId;
    if (!leagueId) return apiResponse(400, null, 'leagueId is required');

    const league = await getLeagueById(leagueId);
    if (!league) return apiResponse(404, null, 'League not found');

    if (!league.memberIds.includes(event.user.userId)) {
      return apiResponse(403, null, 'You are not a member of this league');
    }

    const period = event.queryStringParameters?.period || 'week';
    const dateParam = event.queryStringParameters?.date;
    const seasonParam = event.queryStringParameters?.season;
    const action = event.queryStringParameters?.action;

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

    const { db } = await connectToDatabase();
    const memberSet = new Set(league.memberIds);

    const picks = await db
      .collection<PickDocument>(PICKS_COLLECTION)
      .find({ season: currentSeason })
      .project({
        userId: 1,
        golferIds: 1,
        captainId: 1,
        totalSpent: 1,
        createdAt: 1,
        gameweekRosters: 1,
        allGolferIds: 1,
      })
      .toArray();

    const memberPicks = picks.filter((p) => memberSet.has(p.userId.toString()));

    if (memberPicks.length === 0) {
      const members = await getLeagueMembers(league);
      const now = new Date();
      const weekStart = getWeekStart(now, firstGW);
      const weekEnd = getWeekEnd(weekStart, firstGW);
      const monthStart = getMonthStart(now);
      const monthEnd = getMonthEnd(now);
      return apiResponse(200, {
        league,
        members,
        entries: [],
        leaders: {
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
            hasPrevious: false,
            hasNext: false,
          },
          currentMonth: {
            type: 'month',
            startDate: monthStart.toISOString(),
            endDate: monthEnd.toISOString(),
            label: formatMonthLabel(monthStart),
            hasPrevious: false,
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
        tournamentCount: 0,
      });
    }

    const userIds = memberPicks.map((p) => p.userId);
    const users = await db
      .collection<UserDocument>(USERS_COLLECTION)
      .find({ _id: { $in: userIds } })
      .project({ passwordHash: 0 })
      .toArray();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const publishedTournaments = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({ season: currentSeason, status: { $in: ['published', 'complete'] } })
      .project({ _id: 1, startDate: 1, status: 1, season: 1, name: 1 })
      .toArray();

    const seasonTournaments = publishedTournaments.filter((t) => {
      const startDate = new Date(t.startDate);
      return startDate >= seasonStartDate && startDate <= seasonEndDate;
    });

    const tournamentIds = seasonTournaments.map((t) => t._id);
    const allScores =
      tournamentIds.length > 0
        ? await db
            .collection<ScoreDocument>(SCORES_COLLECTION)
            .find({ tournamentId: { $in: tournamentIds } })
            .project({ golferId: 1, tournamentId: 1, multipliedPoints: 1, participated: 1 })
            .toArray()
        : [];

    const members = await getLeagueMembers(league);
    const now = new Date();

    // Leaders action
    if (action === 'leaders') {
      const weekStart = getWeekStart(now, firstGW);
      const weekEnd = getWeekEnd(weekStart, firstGW);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(weekEnd);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
      const monthStart = getMonthStart(now);
      const monthEnd = getMonthEnd(now);
      const prevMonthStart = getMonthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const prevMonthEnd = getMonthEnd(new Date(now.getFullYear(), now.getMonth() - 1, 1));

      const weekData = calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        weekStart,
        weekEnd,
        firstGW,
        memberSet,
        seasonStartDate
      );
      const prevWeekData = calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        prevWeekStart,
        prevWeekEnd,
        firstGW,
        memberSet,
        seasonStartDate
      );
      const monthData = calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        monthStart,
        monthEnd,
        firstGW,
        memberSet,
        seasonStartDate
      );
      const prevMonthData = calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        prevMonthStart,
        prevMonthEnd,
        firstGW,
        memberSet,
        seasonStartDate
      );
      const seasonData = calculateLeaderboard(
        picks,
        userMap,
        seasonTournaments,
        allScores,
        seasonStartDate,
        seasonEndDate,
        firstGW,
        memberSet,
        seasonStartDate
      );

      const weekRanked = rankEntries(weekData.entries, prevWeekData.entries);
      const monthRanked = rankEntries(monthData.entries, prevMonthData.entries);
      const seasonRanked = rankEntries(seasonData.entries, null);

      return apiResponse(200, {
        league,
        members,
        leaders: {
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
        },
      });
    }

    // Period leaderboard
    const referenceDate = dateParam ? new Date(dateParam) : now;
    let periodStart: Date,
      periodEnd: Date,
      prevPeriodStart: Date,
      prevPeriodEnd: Date,
      periodLabel: string;

    if (period === 'week') {
      periodStart = getWeekStart(referenceDate, firstGW);
      periodEnd = getWeekEnd(periodStart, firstGW);
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
      periodStart = seasonStartDate;
      periodEnd = seasonEndDate;
      prevPeriodStart = periodStart;
      prevPeriodEnd = periodEnd;
      periodLabel = `${currentSeason} Season`;
    }

    const currentData = calculateLeaderboard(
      picks,
      userMap,
      seasonTournaments,
      allScores,
      periodStart,
      periodEnd,
      firstGW,
      memberSet,
      seasonStartDate
    );
    const previousData =
      period !== 'season'
        ? calculateLeaderboard(
            picks,
            userMap,
            seasonTournaments,
            allScores,
            prevPeriodStart,
            prevPeriodEnd,
            firstGW,
            memberSet,
            seasonStartDate
          )
        : null;

    const ranked = rankEntries(currentData.entries, previousData?.entries || null);

    const firstGameweekAnchor = getFirstGameweekStart(seasonStartDate, firstGW);
    let hasPrevious = false,
      hasNext = false;
    let previousDate: string | null = null;
    let nextDate: string | null = null;

    if (period === 'week') {
      hasPrevious = periodStart > firstGameweekAnchor;
      hasNext = periodEnd < getWeekEnd(getWeekStart(now, firstGW), firstGW);
      if (hasPrevious) {
        const prev = new Date(periodStart);
        prev.setDate(prev.getDate() - 1);
        previousDate = formatDateString(getWeekStart(prev, firstGW));
      }
      if (hasNext) {
        nextDate = formatDateString(getNextWeekStart(periodStart, firstGW));
      }
    } else if (period === 'month') {
      hasPrevious = periodStart > firstGameweekAnchor;
      hasNext = periodEnd < getMonthEnd(now);
      if (hasPrevious) {
        previousDate = formatDateString(
          new Date(periodStart.getFullYear(), periodStart.getMonth() - 1, 1)
        );
      }
      if (hasNext) {
        nextDate = formatDateString(
          new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1)
        );
      }
    }

    return apiResponse(200, {
      league,
      members,
      entries: ranked,
      period: {
        type: period,
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch league details';
    return apiResponse(500, null, message);
  }
});
