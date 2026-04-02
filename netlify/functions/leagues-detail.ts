// GET /.netlify/functions/leagues-detail?leagueId=X&period=week|month|season&date=ISO&season=2026

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { getLeagueById, getLeagueMembers } from './_shared/services/leagues.service';
import { connectToDatabase } from './_shared/db';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { getActiveSeason, getSeasonByName } from './_shared/services/seasons.service';
import { getWeekStart, getWeekEnd as getWeekEndUtil, getMonthStart, getTeamEffectiveStartDate, getGameweekNumber } from './_shared/utils/dates';

function getWeekEnd(date: Date, firstGameweekStart?: Date | null): Date {
  return getWeekEndUtil(date, firstGameweekStart);
}

function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatWeekLabel(start: Date, end: Date, gameweek?: number): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const dateRange = `${start.toLocaleDateString('en-GB', options)} - ${end.toLocaleDateString('en-GB', options)}`;
  return gameweek && gameweek > 0 ? `Gameweek ${gameweek}: ${dateRange}` : dateRange;
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

interface LeaderboardEntry {
  rank: number;
  oldRank: number | null;
  movement: 'up' | 'down' | 'same' | 'new';
  movementAmount: number;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  points: number;
  teamValue: number;
  eventsPlayed: number;
}

function calculateLeaderboard(
  picks: PickDocument[],
  userMap: Map<string, UserDocument>,
  tournaments: TournamentDocument[],
  allScores: ScoreDocument[],
  periodStart: Date,
  periodEnd: Date,
  memberSet: Set<string>,
  firstGameweekStart?: Date | null
) {
  const periodTournaments = tournaments.filter((t) => {
    const startDate = new Date(t.startDate);
    return startDate >= periodStart && startDate <= periodEnd;
  });

  const periodTournamentIds = new Set(periodTournaments.map((t) => t._id.toString()));
  const tournamentDateMap = new Map<string, Date>();
  for (const t of periodTournaments) {
    tournamentDateMap.set(t._id.toString(), new Date(t.startDate));
  }

  const scoresByPlayerAndTournament = new Map<string, Map<string, ScoreDocument>>();
  for (const score of allScores) {
    if (!periodTournamentIds.has(score.tournamentId.toString())) continue;
    const golferId = score.golferId.toString();
    if (!scoresByPlayerAndTournament.has(golferId)) {
      scoresByPlayerAndTournament.set(golferId, new Map());
    }
    scoresByPlayerAndTournament.get(golferId)!.set(score.tournamentId.toString(), score);
  }

  const entries: Array<{ userId: string; user: UserDocument; points: number; teamValue: number; events: number }> = [];

  for (const pick of picks) {
    const userId = pick.userId.toString();
    if (!memberSet.has(userId)) continue;
    const user = userMap.get(userId);
    if (!user) continue;

    const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt, firstGameweekStart);
    let points = 0;
    const eventsSet = new Set<string>();

    for (const golferId of pick.golferIds) {
      const playerScores = scoresByPlayerAndTournament.get(golferId.toString());
      if (!playerScores) continue;
      for (const [tournamentId, score] of playerScores) {
        const tournamentDate = tournamentDateMap.get(tournamentId);
        if (tournamentDate && tournamentDate < teamEffectiveStart) continue;
        points += score.multipliedPoints || 0;
        if (score.participated) eventsSet.add(tournamentId);
      }
    }

    entries.push({ userId, user, points, teamValue: pick.totalSpent, events: eventsSet.size });
  }

  return { entries, tournamentCount: periodTournaments.length };
}

function rankEntries(
  currentEntries: Array<{ userId: string; user: UserDocument; points: number; teamValue: number; events: number }>,
  previousEntries: Array<{ userId: string; user: UserDocument; points: number; teamValue: number; events: number }> | null
): LeaderboardEntry[] {
  const sorted = [...currentEntries].sort((a, b) => b.points - a.points);

  const previousRankMap = new Map<string, number>();
  if (previousEntries) {
    const prevSorted = [...previousEntries].sort((a, b) => b.points - a.points);
    let prevRank = 1;
    prevSorted.forEach((entry, index) => {
      if (index > 0 && entry.points < prevSorted[index - 1].points) prevRank = index + 1;
      previousRankMap.set(entry.userId, prevRank);
    });
  }

  let currentRank = 1;
  return sorted.map((entry, index) => {
    if (index > 0 && entry.points < sorted[index - 1].points) currentRank = index + 1;
    const oldRank = previousRankMap.get(entry.userId) ?? null;
    let movement: 'up' | 'down' | 'same' | 'new' = 'new';
    let movementAmount = 0;
    if (oldRank !== null) {
      if (oldRank > currentRank) { movement = 'up'; movementAmount = oldRank - currentRank; }
      else if (oldRank < currentRank) { movement = 'down'; movementAmount = currentRank - oldRank; }
      else { movement = 'same'; }
    }
    return {
      rank: currentRank, oldRank, movement, movementAmount,
      userId: entry.userId, firstName: entry.user.firstName, lastName: entry.user.lastName,
      username: entry.user.username, points: entry.points, teamValue: entry.teamValue,
      eventsPlayed: entry.events,
    };
  });
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
    const seasonStartDate = activeSeason ? new Date(activeSeason.startDate) : new Date(`${fallbackYear}-01-01`);
    const seasonEndDate = activeSeason ? new Date(activeSeason.endDate) : new Date(`${fallbackYear}-12-31`);
    seasonEndDate.setHours(23, 59, 59, 999);
    const currentSeason = activeSeason ? parseInt(activeSeason.name) || fallbackYear : fallbackYear;
    const firstGW = activeSeason?.firstGameweekStart ? new Date(activeSeason.firstGameweekStart) : null;

    const { db } = await connectToDatabase();
    const memberSet = new Set(league.memberIds);

    const picks = await db.collection<PickDocument>(PICKS_COLLECTION)
      .find({ season: currentSeason })
      .project({ userId: 1, golferIds: 1, captainId: 1, totalSpent: 1, createdAt: 1 })
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
          weeklyLeader: null, monthlyLeader: null, seasonLeader: null,
          currentWeek: { type: 'week', startDate: weekStart.toISOString(), endDate: weekEnd.toISOString(), label: formatWeekLabel(weekStart, weekEnd, getGameweekNumber(weekStart, seasonStartDate, firstGW)), hasPrevious: false, hasNext: false },
          currentMonth: { type: 'month', startDate: monthStart.toISOString(), endDate: monthEnd.toISOString(), label: formatMonthLabel(monthStart), hasPrevious: false, hasNext: false },
          seasonInfo: { type: 'season', startDate: seasonStartDate.toISOString(), endDate: seasonEndDate.toISOString(), label: `${currentSeason} Season`, hasPrevious: false, hasNext: false },
        },
        tournamentCount: 0,
      });
    }

    const userIds = memberPicks.map((p) => p.userId);
    const users = await db.collection<UserDocument>(USERS_COLLECTION).find({ _id: { $in: userIds } }).project({ passwordHash: 0 }).toArray();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const publishedTournaments = await db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({ season: currentSeason, status: { $in: ['published', 'complete'] } })
      .project({ _id: 1, startDate: 1, status: 1, season: 1, name: 1 })
      .toArray();

    const seasonTournaments = publishedTournaments.filter((t) => {
      const startDate = new Date(t.startDate);
      return startDate >= seasonStartDate && startDate <= seasonEndDate;
    });

    const tournamentIds = seasonTournaments.map((t) => t._id);
    const allScores = tournamentIds.length > 0
      ? await db.collection<ScoreDocument>(SCORES_COLLECTION)
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
      const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekEnd = new Date(weekEnd); prevWeekEnd.setDate(prevWeekEnd.getDate() - 7);
      const monthStart = getMonthStart(now);
      const monthEnd = getMonthEnd(now);
      const prevMonthStart = getMonthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const prevMonthEnd = getMonthEnd(new Date(now.getFullYear(), now.getMonth() - 1, 1));

      const weekData = calculateLeaderboard(picks, userMap, seasonTournaments, allScores, weekStart, weekEnd, memberSet, firstGW);
      const prevWeekData = calculateLeaderboard(picks, userMap, seasonTournaments, allScores, prevWeekStart, prevWeekEnd, memberSet, firstGW);
      const monthData = calculateLeaderboard(picks, userMap, seasonTournaments, allScores, monthStart, monthEnd, memberSet, firstGW);
      const prevMonthData = calculateLeaderboard(picks, userMap, seasonTournaments, allScores, prevMonthStart, prevMonthEnd, memberSet, firstGW);
      const seasonData = calculateLeaderboard(picks, userMap, seasonTournaments, allScores, seasonStartDate, seasonEndDate, memberSet, firstGW);

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
          currentWeek: { type: 'week', startDate: weekStart.toISOString(), endDate: weekEnd.toISOString(), label: formatWeekLabel(weekStart, weekEnd, getGameweekNumber(weekStart, seasonStartDate, firstGW)), gameweek: getGameweekNumber(weekStart, seasonStartDate, firstGW), hasPrevious: weekStart > seasonStartDate, hasNext: weekEnd < now },
          currentMonth: { type: 'month', startDate: monthStart.toISOString(), endDate: monthEnd.toISOString(), label: formatMonthLabel(monthStart), hasPrevious: monthStart > seasonStartDate, hasNext: monthEnd < now },
          seasonInfo: { type: 'season', startDate: seasonStartDate.toISOString(), endDate: seasonEndDate.toISOString(), label: `${currentSeason} Season`, hasPrevious: false, hasNext: false },
        },
      });
    }

    // Period leaderboard
    const referenceDate = dateParam ? new Date(dateParam) : now;
    let periodStart: Date, periodEnd: Date, prevPeriodStart: Date, prevPeriodEnd: Date, periodLabel: string;

    if (period === 'week') {
      periodStart = getWeekStart(referenceDate, firstGW);
      periodEnd = getWeekEnd(periodStart, firstGW);
      prevPeriodStart = new Date(periodStart); prevPeriodStart.setDate(prevPeriodStart.getDate() - 7);
      prevPeriodEnd = new Date(periodEnd); prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 7);
      periodLabel = formatWeekLabel(periodStart, periodEnd, getGameweekNumber(periodStart, seasonStartDate, firstGW));
    } else if (period === 'month') {
      periodStart = getMonthStart(referenceDate);
      periodEnd = getMonthEnd(referenceDate);
      prevPeriodStart = getMonthStart(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1));
      prevPeriodEnd = getMonthEnd(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1));
      periodLabel = formatMonthLabel(periodStart);
    } else {
      periodStart = seasonStartDate;
      periodEnd = seasonEndDate;
      prevPeriodStart = periodStart;
      prevPeriodEnd = periodEnd;
      periodLabel = `${currentSeason} Season`;
    }

    const currentData = calculateLeaderboard(picks, userMap, seasonTournaments, allScores, periodStart, periodEnd, memberSet, firstGW);
    const previousData = period !== 'season'
      ? calculateLeaderboard(picks, userMap, seasonTournaments, allScores, prevPeriodStart, prevPeriodEnd, memberSet, firstGW)
      : null;

    const ranked = rankEntries(currentData.entries, previousData?.entries || null);

    let hasPrevious = false, hasNext = false;
    if (period === 'week') {
      hasPrevious = periodStart > seasonStartDate;
      hasNext = periodEnd < getWeekEnd(getWeekStart(now, firstGW), firstGW);
    } else if (period === 'month') {
      hasPrevious = periodStart > seasonStartDate;
      hasNext = periodEnd < getMonthEnd(now);
    }

    return apiResponse(200, {
      league,
      members,
      entries: ranked,
      period: {
        type: period, startDate: periodStart.toISOString(), endDate: periodEnd.toISOString(),
        label: periodLabel, gameweek: period === 'week' ? getGameweekNumber(periodStart, seasonStartDate, firstGW) : undefined,
        hasPrevious, hasNext,
      },
      tournamentCount: currentData.tournamentCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch league details';
    return apiResponse(500, null, message);
  }
});
