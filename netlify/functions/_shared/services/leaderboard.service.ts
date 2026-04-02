// Leaderboard service - calculate rankings using MongoDB aggregation pipelines

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { USERS_COLLECTION } from '../models/User';
import { PICKS_COLLECTION } from '../models/Pick';
import { SCORES_COLLECTION } from '../models/Score';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from '../models/Golfer';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import type { LeaderboardEntry, TeamOfTheWeekResponse, TeamOfTheWeekGolfer } from '../../../../shared/types';
import {
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getSeasonStart,
  getTeamEffectiveStartDate,
  getGameweekNumber,
  formatDateString,
} from '../utils/dates';
import { getActiveSeason, getSeasonByName } from './seasons.service';
import { getRedisClient, getRedisKeyPrefix } from '../rateLimit';

const LEADERBOARD_CACHE_TTL = 60; // 60 seconds

function leaderboardCacheKey(type: string, season: number, extra?: string): string {
  const base = `${getRedisKeyPrefix()}v1:cache:leaderboard:${type}:${season}`;
  return extra ? `${base}:${extra}` : base;
}

async function getCachedLeaderboard<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    return null;
  }
}

async function setCachedLeaderboard<T>(key: string, data: T): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(key, JSON.stringify(data), 'EX', LEADERBOARD_CACHE_TTL);
  } catch {
    // Redis unavailable — continue without caching
  }
}

export async function invalidateLeaderboardCache(season: number): Promise<void> {
  try {
    const redis = getRedisClient();
    const prefix = `${getRedisKeyPrefix()}v1:cache:leaderboard:`;
    const keys = await redis.keys(`${prefix}*:${season}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Redis unavailable
  }
}

interface ExtendedLeaderboardEntry {
  rank: number;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  points: number;
  teamValue: number;
  tournamentsPlayed: number;
}

interface FullLeaderboardResponse {
  season: ExtendedLeaderboardEntry[];
  month: ExtendedLeaderboardEntry[];
  week: ExtendedLeaderboardEntry[];
  currentMonth: string;
  weekStart: string;
  weekEnd: string;
}

interface AggregatedScore {
  golferId: ObjectId;
  tournamentId: ObjectId;
  multipliedPoints: number;
  participated?: boolean;
}

interface AggregatedPick {
  userId: ObjectId;
  captainId?: ObjectId | null;
  createdAt: Date;
  totalSpent: number;
  scores: AggregatedScore[];
  user?: { _id: ObjectId; username: string; firstName?: string; lastName?: string };
}

async function getCurrentSeason(): Promise<number> {
  const activeSeason = await getActiveSeason();
  return activeSeason
    ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
    : new Date().getFullYear();
}

export async function getFullLeaderboard(season?: number): Promise<FullLeaderboardResponse> {
  const activeSeason = await getActiveSeason();
  const currentSeason = season ?? (activeSeason
    ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
    : new Date().getFullYear());
  const firstGW = activeSeason?.firstGameweekStart ? new Date(activeSeason.firstGameweekStart) : null;
  const cacheKey = leaderboardCacheKey('full', currentSeason);

  const cached = await getCachedLeaderboard<FullLeaderboardResponse>(cacheKey);
  if (cached) return cached;

  const { db } = await connectToDatabase();

  // Date ranges
  const seasonStart = getSeasonStart();
  const monthStart = getMonthStart();
  const monthEnd = getMonthEnd();
  const weekStart = getWeekStart(undefined, firstGW);
  const weekEnd = getWeekEnd(weekStart, firstGW);

  const emptyResponse: FullLeaderboardResponse = {
    season: [],
    month: [],
    week: [],
    currentMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };

  // Get published/complete tournament IDs and dates (projected, small query)
  const publishedTournaments = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .find({ season: currentSeason, status: { $in: ['published', 'complete'] } })
    .project<{ _id: ObjectId; startDate: Date }>({ _id: 1, startDate: 1 })
    .toArray();

  const tournamentIds = publishedTournaments.map((t) => t._id);
  const tournamentDateMap = new Map(
    publishedTournaments.map((t) => [t._id.toString(), new Date(t.startDate)])
  );

  // Aggregation: picks joined with scores and user data
  const pickResults = await db
    .collection(PICKS_COLLECTION)
    .aggregate<AggregatedPick>([
      { $match: { season: currentSeason } },
      {
        $lookup: {
          from: SCORES_COLLECTION,
          let: { golferIds: '$golferIds' },
          pipeline: [
            {
              $match: {
                $expr: { $in: ['$golferId', '$$golferIds'] },
                tournamentId: { $in: tournamentIds },
              },
            },
            { $project: { golferId: 1, tournamentId: 1, multipliedPoints: 1, participated: 1 } },
          ],
          as: 'scores',
        },
      },
      {
        $lookup: {
          from: USERS_COLLECTION,
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { username: 1, firstName: 1, lastName: 1 } }],
          as: 'userArr',
        },
      },
      { $unwind: { path: '$userArr', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: 1,
          captainId: 1,
          createdAt: 1,
          totalSpent: 1,
          scores: 1,
          user: '$userArr',
        },
      },
    ])
    .toArray();

  if (pickResults.length === 0) return emptyResponse;

  // Calculate points per user across date ranges (captain multiplier + effective start date in JS)
  const leaderboardData: Array<{
    userId: string;
    user: { username: string; firstName: string; lastName: string };
    totalSpent: number;
    seasonPoints: number;
    monthPoints: number;
    weekPoints: number;
    seasonTournaments: number;
    monthTournaments: number;
    weekTournaments: number;
  }> = [];

  for (const pick of pickResults) {
    const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt, firstGW);
    const captainIdStr = pick.captainId?.toString();

    let seasonPoints = 0;
    let monthPoints = 0;
    let weekPoints = 0;
    const seasonTournamentSet = new Set<string>();
    const monthTournamentSet = new Set<string>();
    const weekTournamentSet = new Set<string>();

    for (const score of pick.scores) {
      const tournamentId = score.tournamentId.toString();
      const tournamentDate = tournamentDateMap.get(tournamentId);
      if (!tournamentDate || tournamentDate < teamEffectiveStart) continue;

      const isCaptain = score.golferId.toString() === captainIdStr;
      const points = (score.multipliedPoints || 0) * (isCaptain ? 2 : 1);

      if (tournamentDate >= seasonStart) {
        seasonPoints += points;
        if (score.participated) seasonTournamentSet.add(tournamentId);
      }
      if (tournamentDate >= monthStart && tournamentDate <= monthEnd) {
        monthPoints += points;
        if (score.participated) monthTournamentSet.add(tournamentId);
      }
      if (tournamentDate >= weekStart && tournamentDate <= weekEnd) {
        weekPoints += points;
        if (score.participated) weekTournamentSet.add(tournamentId);
      }
    }

    leaderboardData.push({
      userId: pick.userId.toString(),
      user: {
        username: pick.user?.username || 'Unknown',
        firstName: pick.user?.firstName || '',
        lastName: pick.user?.lastName || '',
      },
      totalSpent: pick.totalSpent,
      seasonPoints,
      monthPoints,
      weekPoints,
      seasonTournaments: seasonTournamentSet.size,
      monthTournaments: monthTournamentSet.size,
      weekTournaments: weekTournamentSet.size,
    });
  }

  // Create sorted leaderboards with tie handling
  const createLeaderboard = (
    data: typeof leaderboardData,
    pointsKey: 'seasonPoints' | 'monthPoints' | 'weekPoints',
    tournamentsKey: 'seasonTournaments' | 'monthTournaments' | 'weekTournaments'
  ): ExtendedLeaderboardEntry[] => {
    const sorted = [...data].sort((a, b) => b[pointsKey] - a[pointsKey]);
    let currentRank = 1;

    return sorted.map((entry, index) => {
      if (index > 0 && entry[pointsKey] < sorted[index - 1][pointsKey]) {
        currentRank = index + 1;
      }

      return {
        rank: currentRank,
        userId: entry.userId,
        firstName: entry.user.firstName,
        lastName: entry.user.lastName,
        username: entry.user.username,
        points: entry[pointsKey],
        teamValue: entry.totalSpent,
        tournamentsPlayed: entry[tournamentsKey],
      };
    });
  };

  const result: FullLeaderboardResponse = {
    season: createLeaderboard(leaderboardData, 'seasonPoints', 'seasonTournaments'),
    month: createLeaderboard(leaderboardData, 'monthPoints', 'monthTournaments'),
    week: createLeaderboard(leaderboardData, 'weekPoints', 'weekTournaments'),
    currentMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };

  await setCachedLeaderboard(cacheKey, result);
  return result;
}

export async function getLeaderboard(season?: number): Promise<LeaderboardEntry[]> {
  const activeSeason = await getActiveSeason();
  const currentSeason = season ?? (activeSeason
    ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
    : new Date().getFullYear());
  const firstGW = activeSeason?.firstGameweekStart ? new Date(activeSeason.firstGameweekStart) : null;
  const cacheKey = leaderboardCacheKey('simple', currentSeason);

  const cached = await getCachedLeaderboard<LeaderboardEntry[]>(cacheKey);
  if (cached) return cached;

  const { db } = await connectToDatabase();

  // Get published tournament IDs and dates (projected, small query)
  const publishedTournaments = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .find({ status: 'published', season: currentSeason })
    .project<{ _id: ObjectId; startDate: Date }>({ _id: 1, startDate: 1 })
    .toArray();

  const tournamentIds = publishedTournaments.map((t) => t._id);
  const tournamentDateMap = new Map(
    publishedTournaments.map((t) => [t._id.toString(), new Date(t.startDate)])
  );

  // Aggregation: picks joined with scores and user data
  const pickResults = await db
    .collection(PICKS_COLLECTION)
    .aggregate<AggregatedPick>([
      { $match: { season: currentSeason } },
      {
        $lookup: {
          from: SCORES_COLLECTION,
          let: { golferIds: '$golferIds' },
          pipeline: [
            {
              $match: {
                $expr: { $in: ['$golferId', '$$golferIds'] },
                tournamentId: { $in: tournamentIds },
              },
            },
            { $project: { golferId: 1, tournamentId: 1, multipliedPoints: 1 } },
          ],
          as: 'scores',
        },
      },
      {
        $lookup: {
          from: USERS_COLLECTION,
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { username: 1 } }],
          as: 'userArr',
        },
      },
      { $unwind: { path: '$userArr', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: 1,
          captainId: 1,
          createdAt: 1,
          scores: 1,
          user: '$userArr',
        },
      },
    ])
    .toArray();

  // Calculate points per user (captain multiplier + effective start date in JS)
  const pickUserIds: ObjectId[] = [];
  const leaderboardData: Array<{ userId: string; username: string; totalPoints: number }> = [];

  for (const pick of pickResults) {
    pickUserIds.push(pick.userId);
    const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt, firstGW);
    const captainIdStr = pick.captainId?.toString();
    let totalPoints = 0;

    for (const score of pick.scores) {
      const tournamentDate = tournamentDateMap.get(score.tournamentId.toString());
      if (tournamentDate && tournamentDate < teamEffectiveStart) continue;
      const isCaptain = score.golferId.toString() === captainIdStr;
      totalPoints += (score.multipliedPoints || 0) * (isCaptain ? 2 : 1);
    }

    leaderboardData.push({
      userId: pick.userId.toString(),
      username: pick.user?.username || 'Unknown',
      totalPoints,
    });
  }

  // Include users without picks (0 points)
  const usersWithoutPicks = await db
    .collection(USERS_COLLECTION)
    .find({ _id: { $nin: pickUserIds } })
    .project<{ _id: ObjectId; username: string }>({ _id: 1, username: 1 })
    .toArray();

  for (const user of usersWithoutPicks) {
    leaderboardData.push({
      userId: user._id.toString(),
      username: user.username,
      totalPoints: 0,
    });
  }

  // Sort and rank with tie handling
  leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);

  let currentRank = 1;
  const result = leaderboardData.map((entry, index) => {
    if (index > 0 && entry.totalPoints < leaderboardData[index - 1].totalPoints) {
      currentRank = index + 1;
    }
    return {
      userId: entry.userId,
      username: entry.username,
      totalPoints: entry.totalPoints,
      rank: currentRank,
    };
  });

  await setCachedLeaderboard(cacheKey, result);
  return result;
}

export async function getTournamentLeaderboard(
  tournamentId: string,
  season?: number
): Promise<LeaderboardEntry[]> {
  const activeSeason = await getActiveSeason();
  const currentSeason = season ?? (activeSeason
    ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
    : new Date().getFullYear());
  const firstGW = activeSeason?.firstGameweekStart ? new Date(activeSeason.firstGameweekStart) : null;
  const cacheKey = leaderboardCacheKey('tournament', currentSeason, tournamentId);

  const cached = await getCachedLeaderboard<LeaderboardEntry[]>(cacheKey);
  if (cached) return cached;

  const { db } = await connectToDatabase();

  // Get the tournament (project only needed fields)
  const tournament = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .findOne(
      { _id: new ObjectId(tournamentId) },
      { projection: { status: 1, startDate: 1 } }
    );

  if (!tournament || tournament.status !== 'published') {
    return [];
  }

  const tournamentDate = new Date(tournament.startDate);
  const tournamentObjId = new ObjectId(tournamentId);

  // Aggregation: picks joined with scores for this tournament and user data
  const pickResults = await db
    .collection(PICKS_COLLECTION)
    .aggregate<AggregatedPick>([
      { $match: { season: currentSeason } },
      {
        $lookup: {
          from: SCORES_COLLECTION,
          let: { golferIds: '$golferIds' },
          pipeline: [
            {
              $match: {
                $expr: { $in: ['$golferId', '$$golferIds'] },
                tournamentId: tournamentObjId,
              },
            },
            { $project: { golferId: 1, multipliedPoints: 1 } },
          ],
          as: 'scores',
        },
      },
      {
        $lookup: {
          from: USERS_COLLECTION,
          localField: 'userId',
          foreignField: '_id',
          pipeline: [{ $project: { username: 1 } }],
          as: 'userArr',
        },
      },
      { $unwind: { path: '$userArr', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: 1,
          captainId: 1,
          createdAt: 1,
          scores: 1,
          user: '$userArr',
        },
      },
    ])
    .toArray();

  // Calculate points per user (captain multiplier + effective start date in JS)
  const pickUserIds: ObjectId[] = [];
  const leaderboardData: Array<{ userId: string; username: string; totalPoints: number }> = [];

  for (const pick of pickResults) {
    pickUserIds.push(pick.userId);
    const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt, firstGW);
    const captainIdStr = pick.captainId?.toString();
    let totalPoints = 0;

    if (tournamentDate >= teamEffectiveStart) {
      for (const score of pick.scores) {
        const isCaptain = score.golferId.toString() === captainIdStr;
        totalPoints += (score.multipliedPoints || 0) * (isCaptain ? 2 : 1);
      }
    }

    leaderboardData.push({
      userId: pick.userId.toString(),
      username: pick.user?.username || 'Unknown',
      totalPoints,
    });
  }

  // Include users without picks (0 points)
  const usersWithoutPicks = await db
    .collection(USERS_COLLECTION)
    .find({ _id: { $nin: pickUserIds } })
    .project<{ _id: ObjectId; username: string }>({ _id: 1, username: 1 })
    .toArray();

  for (const user of usersWithoutPicks) {
    leaderboardData.push({
      userId: user._id.toString(),
      username: user.username,
      totalPoints: 0,
    });
  }

  // Sort and rank with tie handling
  leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);

  let currentRank = 1;
  const result = leaderboardData.map((entry, index) => {
    if (index > 0 && entry.totalPoints < leaderboardData[index - 1].totalPoints) {
      currentRank = index + 1;
    }
    return {
      userId: entry.userId,
      username: entry.username,
      totalPoints: entry.totalPoints,
      rank: currentRank,
    };
  });

  await setCachedLeaderboard(cacheKey, result);
  return result;
}

const TEAM_OF_WEEK_CACHE_TTL = 3600; // 1  past weeks are immutablehour 

/**
 * Get the "Team of the  the 6 golfers who scored the most pointsWeek" 
 * across all tournaments in a completed gameweek.
 *
 * The highest scorer is designated as the "dream captain" and their points
 * are doubled in the total, mirroring the captain mechanic in the real game.
 */
export async function getTeamOfTheWeek(
  date: string,
  season: number
): Promise<TeamOfTheWeekResponse | null> {
  const seasonData = await getSeasonByName(String(season));
  const firstGW = seasonData?.firstGameweekStart
    ? new Date(seasonData.firstGameweekStart)
    : null;
  const seasonStartDate = seasonData?.startDate
    ? new Date(seasonData.startDate)
    : new Date(season, 0, 1);

  const requestDate = new Date(date);
  const weekStart = getWeekStart(requestDate, firstGW);
  const weekEnd = getWeekEnd(weekStart, firstGW);

  // Only allow completed weeks (week end must be in the past)
  if (weekEnd >= new Date()) {
    return null;
  }

  const weekKey = formatDateString(weekStart);
  const cacheKey = leaderboardCacheKey('team-of-week', season, weekKey);

  const cached = await getCachedLeaderboard<TeamOfTheWeekResponse>(cacheKey);
  if (cached) return cached;

  const { db } = await connectToDatabase();

  // Get published/complete tournaments in the week date range
  const tournaments = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .find({
      season,
      status: { $in: ['published', 'complete'] },
      startDate: { $gte: weekStart, $lte: weekEnd },
    })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();

  const gameweek = getGameweekNumber(weekStart, seasonStartDate, firstGW);

  if (tournaments.length === 0) {
    const emptyResult: TeamOfTheWeekResponse = {
      golfers: [],
      totalPoints: 0,
      period: {
        label: `Gameweek ${gameweek}`,
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString(),
        gameweek,
      },
      tournamentCount: 0,
    };
    await setCachedLeaderboard(cacheKey, emptyResult);
    return emptyResult;
  }

  const tournamentIds = tournaments.map((t) => t._id);

  // Aggregate scores per golfer across all tournaments in the week
  const golferScores = await db
    .collection(SCORES_COLLECTION)
    .aggregate<{ _id: ObjectId; totalPoints: number }>([
      {
        $match: {
          tournamentId: { $in: tournamentIds },
          participated: true,
          multipliedPoints: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$golferId',
          totalPoints: { $sum: '$multipliedPoints' },
        },
      },
      { $sort: { totalPoints: -1 } },
      { $limit: 6 },
    ])
    .toArray();

  if (golferScores.length === 0) {
    const emptyResult: TeamOfTheWeekResponse = {
      golfers: [],
      totalPoints: 0,
      period: {
        label: `Gameweek ${gameweek}`,
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString(),
        gameweek,
      },
      tournamentCount: tournaments.length,
    };
    await setCachedLeaderboard(cacheKey, emptyResult);
    return emptyResult;
  }

  // Fetch golfer details for the top scorers
  const golferIds = golferScores.map((s) => s._id);
  const golferDocs = await db
    .collection<GolferDocument>(GOLFERS_COLLECTION)
    .find({ _id: { $in: golferIds } })
    .toArray();

  const golferMap = new Map(golferDocs.map((doc) => [doc._id.toString(), toGolfer(doc)]));

  // Build the dream  highest scorer is the "dream captain"team 
  const dreamTeam: TeamOfTheWeekGolfer[] = golferScores.map((score, index) => {
    const golfer = golferMap.get(score._id.toString());
    return {
      golfer: {
        id: score._id.toString(),
        firstName: golfer?.firstName || 'Unknown',
        lastName: golfer?.lastName || '',
        picture: golfer?.picture || '',
        price: golfer?.price || 0,
      },
      weekPoints: score.totalPoints,
      isCaptain: index === 0,
    };
  });

  // Total: captain's points doubled + rest as-is
  const totalPoints = dreamTeam.reduce(
    (sum, g) => sum + g.weekPoints * (g.isCaptain ? 2 : 1),
    0
  );

  const result: TeamOfTheWeekResponse = {
    golfers: dreamTeam,
    totalPoints,
    period: {
      label: `Gameweek ${gameweek}`,
      startDate: weekStart.toISOString(),
      endDate: weekEnd.toISOString(),
      gameweek,
    },
    tournamentCount: tournaments.length,
  };

  await setCachedLeaderboard(cacheKey, result);

  // Also set with the longer TTL since past weeks don't change
  try {
    const redis = getRedisClient();
    await redis.expire(cacheKey, TEAM_OF_WEEK_CACHE_TTL);
  } catch {
    // Redis unavailable
  }

  return result;
}
