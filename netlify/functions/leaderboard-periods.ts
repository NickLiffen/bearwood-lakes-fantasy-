// GET /.netlify/functions/leaderboard-periods
// Returns leaderboard data for specific periods (week/month/season) with navigation

import type { Handler } from '@netlify/functions';
import { withAuth } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { UserDocument, USERS_COLLECTION } from './_shared/models/User';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from './_shared/models/Settings';

interface LeaderboardEntry {
  rank: number;
  oldRank: number | null; // Previous period rank (null = NEW)
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

interface PeriodInfo {
  type: 'week' | 'month' | 'season';
  startDate: string;
  endDate: string;
  label: string;
  hasPrevious: boolean;
  hasNext: boolean;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  period: PeriodInfo;
  tournamentCount: number;
}

interface LeadersResponse {
  weeklyLeader: LeaderboardEntry | null;
  monthlyLeader: LeaderboardEntry | null;
  seasonLeader: LeaderboardEntry | null;
  currentWeek: PeriodInfo;
  currentMonth: PeriodInfo;
  seasonInfo: PeriodInfo;
}

// Get Monday of the week containing the given date
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysSinceMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Get Sunday of the week containing the given date
function getWeekEnd(date: Date): Date {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

// Get first day of the month
function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

// Get last day of the month
function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Format week label
function formatWeekLabel(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-GB', options)} - ${end.toLocaleDateString('en-GB', options)}`;
}

// Format month label
function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

async function calculateLeaderboard(
  picks: PickDocument[],
  userMap: Map<string, UserDocument>,
  tournaments: TournamentDocument[],
  allScores: ScoreDocument[],
  periodStart: Date,
  periodEnd: Date
): Promise<{ entries: Array<{ userId: string; user: UserDocument; points: number; teamValue: number; events: number }>; tournamentCount: number }> {
  
  // Filter tournaments within the period
  const periodTournaments = tournaments.filter(t => {
    const startDate = new Date(t.startDate);
    return startDate >= periodStart && startDate <= periodEnd;
  });
  
  const periodTournamentIds = new Set(periodTournaments.map(t => t._id.toString()));
  
  // Create score lookup
  const scoresByPlayerAndTournament = new Map<string, Map<string, ScoreDocument>>();
  for (const score of allScores) {
    if (!periodTournamentIds.has(score.tournamentId.toString())) continue;
    
    const playerId = score.playerId.toString();
    if (!scoresByPlayerAndTournament.has(playerId)) {
      scoresByPlayerAndTournament.set(playerId, new Map());
    }
    scoresByPlayerAndTournament.get(playerId)!.set(score.tournamentId.toString(), score);
  }
  
  // Calculate points for each user
  const entries: Array<{ userId: string; user: UserDocument; points: number; teamValue: number; events: number }> = [];
  
  for (const pick of picks) {
    const user = userMap.get(pick.userId.toString());
    if (!user) continue;
    
    let points = 0;
    const eventsSet = new Set<string>();
    
    for (const playerId of pick.playerIds) {
      const playerScores = scoresByPlayerAndTournament.get(playerId.toString());
      if (!playerScores) continue;
      
      for (const [tournamentId, score] of playerScores) {
        points += score.multipliedPoints || 0;
        if (score.participated) {
          eventsSet.add(tournamentId);
        }
      }
    }
    
    entries.push({
      userId: pick.userId.toString(),
      user,
      points,
      teamValue: pick.totalSpent,
      events: eventsSet.size,
    });
  }
  
  return { entries, tournamentCount: periodTournaments.length };
}

function rankEntries(
  currentEntries: Array<{ userId: string; user: UserDocument; points: number; teamValue: number; events: number }>,
  previousEntries: Array<{ userId: string; user: UserDocument; points: number; teamValue: number; events: number }> | null
): LeaderboardEntry[] {
  // Sort by points descending
  const sorted = [...currentEntries].sort((a, b) => b.points - a.points);
  
  // Create previous rank lookup
  const previousRankMap = new Map<string, number>();
  if (previousEntries) {
    const prevSorted = [...previousEntries].sort((a, b) => b.points - a.points);
    let prevRank = 1;
    prevSorted.forEach((entry, index) => {
      if (index > 0 && entry.points < prevSorted[index - 1].points) {
        prevRank = index + 1;
      }
      previousRankMap.set(entry.userId, prevRank);
    });
  }
  
  // Assign ranks with ties
  let currentRank = 1;
  return sorted.map((entry, index) => {
    if (index > 0 && entry.points < sorted[index - 1].points) {
      currentRank = index + 1;
    }
    
    const oldRank = previousRankMap.get(entry.userId) ?? null;
    let movement: 'up' | 'down' | 'same' | 'new' = 'new';
    let movementAmount = 0;
    
    if (oldRank !== null) {
      if (oldRank > currentRank) {
        movement = 'up';
        movementAmount = oldRank - currentRank;
      } else if (oldRank < currentRank) {
        movement = 'down';
        movementAmount = currentRank - oldRank;
      } else {
        movement = 'same';
      }
    }
    
    return {
      rank: currentRank,
      oldRank,
      movement,
      movementAmount,
      userId: entry.userId,
      firstName: entry.user.firstName,
      lastName: entry.user.lastName,
      username: entry.user.username,
      points: entry.points,
      teamValue: entry.teamValue,
      eventsPlayed: entry.events,
    };
  });
}

export const handler: Handler = withAuth(async (event) => {
  try {
    const { db } = await connectToDatabase();
    
    // Get query params
    const period = event.queryStringParameters?.period || 'week'; // week, month, season
    const dateParam = event.queryStringParameters?.date; // ISO date string
    const action = event.queryStringParameters?.action; // 'leaders' for top 3 summary
    
    // Get season settings
    const seasonStartSetting = await db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'seasonStartDate' });
    const seasonEndSetting = await db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'seasonEndDate' });
    const seasonStartDate = new Date((seasonStartSetting?.value as string) || '2026-01-01');
    const seasonEndDate = new Date((seasonEndSetting?.value as string) || '2026-12-31');
    seasonEndDate.setHours(23, 59, 59, 999);
    
    // Get all picks for current season
    const currentSeasonSetting = await db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'currentSeason' });
    const currentSeason = (currentSeasonSetting?.value as number) || 2026;
    
    const picks = await db.collection<PickDocument>(PICKS_COLLECTION).find({ season: currentSeason }).toArray();
    
    const now = new Date();
    
    if (picks.length === 0) {
      if (action === 'leaders') {
        const weekStart = getWeekStart(now);
        const weekEnd = getWeekEnd(now);
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
                label: formatWeekLabel(weekStart, weekEnd),
                hasPrevious: weekStart > seasonStartDate,
                hasNext: false,
              },
              currentMonth: {
                type: 'month',
                startDate: monthStart.toISOString(),
                endDate: monthEnd.toISOString(),
                label: formatMonthLabel(monthStart),
                hasPrevious: monthStart > seasonStartDate,
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
    const userIds = picks.map(p => p.userId);
    const users = await db.collection<UserDocument>(USERS_COLLECTION).find({ _id: { $in: userIds } }).toArray();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    
    // Get all published or complete tournaments within season
    const publishedTournaments = await db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION).find({
      season: currentSeason,
      status: { $in: ['published', 'complete'] },
    }).toArray();
    
    // Filter to only those within season dates
    const seasonTournaments = publishedTournaments.filter(t => {
      const startDate = new Date(t.startDate);
      return startDate >= seasonStartDate && startDate <= seasonEndDate;
    });
    
    const tournamentIds = seasonTournaments.map(t => t._id);
    
    // Get all scores
    const allScores = tournamentIds.length > 0 
      ? await db.collection<ScoreDocument>(SCORES_COLLECTION).find({
          tournamentId: { $in: tournamentIds },
        }).toArray()
      : [];
    
    // If requesting leaders summary
    if (action === 'leaders') {
      // Current week
      const weekStart = getWeekStart(now);
      const weekEnd = getWeekEnd(now);
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
      const weekData = await calculateLeaderboard(picks, userMap, seasonTournaments, allScores, weekStart, weekEnd);
      const prevWeekData = await calculateLeaderboard(picks, userMap, seasonTournaments, allScores, prevWeekStart, prevWeekEnd);
      const monthData = await calculateLeaderboard(picks, userMap, seasonTournaments, allScores, monthStart, monthEnd);
      const prevMonthData = await calculateLeaderboard(picks, userMap, seasonTournaments, allScores, prevMonthStart, prevMonthEnd);
      const seasonData = await calculateLeaderboard(picks, userMap, seasonTournaments, allScores, seasonStartDate, seasonEndDate);
      
      const weekRanked = rankEntries(weekData.entries, prevWeekData.entries);
      const monthRanked = rankEntries(monthData.entries, prevMonthData.entries);
      const seasonRanked = rankEntries(seasonData.entries, null);
      
      const response: LeadersResponse = {
        weeklyLeader: weekRanked.find(e => e.rank === 1) || null,
        monthlyLeader: monthRanked.find(e => e.rank === 1) || null,
        seasonLeader: seasonRanked.find(e => e.rank === 1) || null,
        currentWeek: {
          type: 'week',
          startDate: weekStart.toISOString(),
          endDate: weekEnd.toISOString(),
          label: formatWeekLabel(weekStart, weekEnd),
          hasPrevious: weekStart > seasonStartDate,
          hasNext: weekEnd < now,
        },
        currentMonth: {
          type: 'month',
          startDate: monthStart.toISOString(),
          endDate: monthEnd.toISOString(),
          label: formatMonthLabel(monthStart),
          hasPrevious: monthStart > seasonStartDate,
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
      periodStart = getWeekStart(referenceDate);
      periodEnd = getWeekEnd(referenceDate);
      prevPeriodStart = new Date(periodStart);
      prevPeriodStart.setDate(prevPeriodStart.getDate() - 7);
      prevPeriodEnd = new Date(periodEnd);
      prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 7);
      periodLabel = formatWeekLabel(periodStart, periodEnd);
    } else if (period === 'month') {
      periodStart = getMonthStart(referenceDate);
      periodEnd = getMonthEnd(referenceDate);
      prevPeriodStart = getMonthStart(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1));
      prevPeriodEnd = getMonthEnd(new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1));
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
    const currentData = await calculateLeaderboard(picks, userMap, seasonTournaments, allScores, periodStart, periodEnd);
    const previousData = period !== 'season' 
      ? await calculateLeaderboard(picks, userMap, seasonTournaments, allScores, prevPeriodStart, prevPeriodEnd)
      : null;
    
    const ranked = rankEntries(currentData.entries, previousData?.entries || null);
    
    // Determine navigation
    let hasPrevious = false;
    let hasNext = false;
    
    if (period === 'week') {
      hasPrevious = periodStart > seasonStartDate;
      hasNext = periodEnd < getWeekEnd(now);
    } else if (period === 'month') {
      hasPrevious = periodStart > seasonStartDate;
      hasNext = periodEnd < getMonthEnd(now);
    }
    
    const response: LeaderboardResponse = {
      entries: ranked,
      period: {
        type: period as 'week' | 'month' | 'season',
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
        label: periodLabel,
        hasPrevious,
        hasNext,
      },
      tournamentCount: currentData.tournamentCount,
    };
    
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
