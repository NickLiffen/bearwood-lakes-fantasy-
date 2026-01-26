// Leaderboard service - calculate rankings

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { UserDocument, USERS_COLLECTION } from '../models/User';
import { PickDocument, PICKS_COLLECTION } from '../models/Pick';
import { ScoreDocument, SCORES_COLLECTION } from '../models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from '../models/Settings';
import type { LeaderboardEntry } from '../../../../shared/types';

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

async function getCurrentSeason(): Promise<number> {
  const { db } = await connectToDatabase();
  const setting = await db
    .collection<SettingDocument>(SETTINGS_COLLECTION)
    .findOne({ key: 'currentSeason' });
  return (setting?.value as number) || 2026;
}

// Get the start of the current week (Monday)
function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days since last Monday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  
  return weekStart;
}

// Get the end of the current week (Sunday 11:59pm)
function getWeekEnd(): Date {
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

// Get the start of the current month
function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

// Get the end of the current month
function getMonthEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Get the start of 2026 season
function getSeasonStart(): Date {
  return new Date(2026, 0, 1, 0, 0, 0, 0);
}

export async function getFullLeaderboard(): Promise<FullLeaderboardResponse> {
  const { db } = await connectToDatabase();
  const currentSeason = await getCurrentSeason();
  
  // Get all picks for current season
  const picks = await db
    .collection<PickDocument>(PICKS_COLLECTION)
    .find({ season: currentSeason })
    .toArray();
  
  if (picks.length === 0) {
    return {
      season: [],
      month: [],
      week: [],
      currentMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
      weekStart: getWeekStart().toISOString(),
      weekEnd: getWeekEnd().toISOString(),
    };
  }
  
  // Get user details
  const userIds = picks.map(p => p.userId);
  const users = await db
    .collection<UserDocument>(USERS_COLLECTION)
    .find({ _id: { $in: userIds } })
    .toArray();
  
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  
  // Get all published or complete tournaments for current season
  const publishedTournaments = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .find({
      season: currentSeason,
      status: { $in: ['published', 'complete'] },
    })
    .toArray();
  
  const tournamentIds = publishedTournaments.map(t => t._id);
  const tournamentMap = new Map(publishedTournaments.map(t => [t._id.toString(), t]));
  
  // Get all scores for these tournaments
  const allScores = await db
    .collection<ScoreDocument>(SCORES_COLLECTION)
    .find({ tournamentId: { $in: tournamentIds } })
    .toArray();
  
  // Create a map of player scores by tournament
  const scoresByPlayerAndTournament = new Map<string, Map<string, ScoreDocument>>();
  for (const score of allScores) {
    const playerId = score.playerId.toString();
    if (!scoresByPlayerAndTournament.has(playerId)) {
      scoresByPlayerAndTournament.set(playerId, new Map());
    }
    scoresByPlayerAndTournament.get(playerId)!.set(score.tournamentId.toString(), score);
  }
  
  // Date ranges
  const seasonStart = getSeasonStart();
  const monthStart = getMonthStart();
  const monthEnd = getMonthEnd();
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();
  
  // Calculate points for each user
  const leaderboardData: Array<{
    userId: string;
    user: UserDocument;
    totalSpent: number;
    seasonPoints: number;
    monthPoints: number;
    weekPoints: number;
    seasonTournaments: number;
    monthTournaments: number;
    weekTournaments: number;
  }> = [];
  
  for (const pick of picks) {
    const user = userMap.get(pick.userId.toString());
    if (!user) continue;
    
    let seasonPoints = 0;
    let monthPoints = 0;
    let weekPoints = 0;
    const seasonTournamentSet = new Set<string>();
    const monthTournamentSet = new Set<string>();
    const weekTournamentSet = new Set<string>();
    
    // Calculate points for each player in the user's team
    for (const playerId of pick.playerIds) {
      const playerScores = scoresByPlayerAndTournament.get(playerId.toString());
      if (!playerScores) continue;
      
      for (const [tournamentId, score] of playerScores) {
        const tournament = tournamentMap.get(tournamentId);
        if (!tournament) continue;
        
        const tournamentDate = new Date(tournament.startDate);
        const points = score.multipliedPoints || 0;
        
        // Season points
        if (tournamentDate >= seasonStart) {
          seasonPoints += points;
          if (score.participated) {
            seasonTournamentSet.add(tournamentId);
          }
        }
        
        // Month points
        if (tournamentDate >= monthStart && tournamentDate <= monthEnd) {
          monthPoints += points;
          if (score.participated) {
            monthTournamentSet.add(tournamentId);
          }
        }
        
        // Week points
        if (tournamentDate >= weekStart && tournamentDate <= weekEnd) {
          weekPoints += points;
          if (score.participated) {
            weekTournamentSet.add(tournamentId);
          }
        }
      }
    }
    
    leaderboardData.push({
      userId: pick.userId.toString(),
      user,
      totalSpent: pick.totalSpent,
      seasonPoints,
      monthPoints,
      weekPoints,
      seasonTournaments: seasonTournamentSet.size,
      monthTournaments: monthTournamentSet.size,
      weekTournaments: weekTournamentSet.size,
    });
  }
  
  // Create sorted leaderboards
  const createLeaderboard = (
    data: typeof leaderboardData,
    pointsKey: 'seasonPoints' | 'monthPoints' | 'weekPoints',
    tournamentsKey: 'seasonTournaments' | 'monthTournaments' | 'weekTournaments'
  ): ExtendedLeaderboardEntry[] => {
    const sorted = [...data].sort((a, b) => b[pointsKey] - a[pointsKey]);
    let currentRank = 1;
    
    return sorted.map((entry, index) => {
      // Handle ties - same points = same rank
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
  
  return {
    season: createLeaderboard(leaderboardData, 'seasonPoints', 'seasonTournaments'),
    month: createLeaderboard(leaderboardData, 'monthPoints', 'monthTournaments'),
    week: createLeaderboard(leaderboardData, 'weekPoints', 'weekTournaments'),
    currentMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const { db } = await connectToDatabase();
  const currentSeason = await getCurrentSeason();

  // Get all users
  const users = await db.collection<UserDocument>(USERS_COLLECTION).find({}).toArray();

  // Get all picks for current season
  const picks = await db
    .collection<PickDocument>(PICKS_COLLECTION)
    .find({ season: currentSeason })
    .toArray();

  // Get published tournaments
  const publishedTournaments = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .find({ status: 'published', season: currentSeason })
    .toArray();

  const publishedTournamentIds = publishedTournaments.map((t) => t._id);

  // Get all scores from published tournaments
  const scores = await db
    .collection<ScoreDocument>(SCORES_COLLECTION)
    .find({ tournamentId: { $in: publishedTournamentIds } })
    .toArray();

  // Build a map of playerId -> total multiplied points
  const playerPointsMap = new Map<string, number>();
  for (const score of scores) {
    const playerId = score.playerId.toString();
    const current = playerPointsMap.get(playerId) || 0;
    playerPointsMap.set(playerId, current + score.multipliedPoints);
  }

  // Calculate total points for each user based on their picks
  const leaderboardData: Array<{ userId: string; username: string; totalPoints: number }> = [];

  for (const user of users) {
    const userPick = picks.find((p) => p.userId.toString() === user._id.toString());

    let totalPoints = 0;
    if (userPick) {
      for (const playerId of userPick.playerIds) {
        totalPoints += playerPointsMap.get(playerId.toString()) || 0;
      }
    }

    leaderboardData.push({
      userId: user._id.toString(),
      username: user.username,
      totalPoints,
    });
  }

  // Sort by total points descending
  leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);

  // Add ranks (handling ties)
  let currentRank = 1;
  const leaderboard: LeaderboardEntry[] = leaderboardData.map((entry, index) => {
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

  return leaderboard;
}

export async function getTournamentLeaderboard(tournamentId: string): Promise<LeaderboardEntry[]> {
  const { db } = await connectToDatabase();
  const currentSeason = await getCurrentSeason();

  // Get the tournament
  const tournament = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .findOne({ _id: new ObjectId(tournamentId) });

  if (!tournament || tournament.status !== 'published') {
    return [];
  }

  // Get all users and their picks
  const users = await db.collection<UserDocument>(USERS_COLLECTION).find({}).toArray();
  const picks = await db
    .collection<PickDocument>(PICKS_COLLECTION)
    .find({ season: currentSeason })
    .toArray();

  // Get scores for this tournament only
  const scores = await db
    .collection<ScoreDocument>(SCORES_COLLECTION)
    .find({ tournamentId: new ObjectId(tournamentId) })
    .toArray();

  // Build a map of playerId -> points for this tournament
  const playerPointsMap = new Map<string, number>();
  for (const score of scores) {
    playerPointsMap.set(score.playerId.toString(), score.multipliedPoints);
  }

  // Calculate points for each user
  const leaderboardData: Array<{ userId: string; username: string; totalPoints: number }> = [];

  for (const user of users) {
    const userPick = picks.find((p) => p.userId.toString() === user._id.toString());

    let totalPoints = 0;
    if (userPick) {
      for (const playerId of userPick.playerIds) {
        totalPoints += playerPointsMap.get(playerId.toString()) || 0;
      }
    }

    leaderboardData.push({
      userId: user._id.toString(),
      username: user.username,
      totalPoints,
    });
  }

  // Sort and rank
  leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);

  let currentRank = 1;
  return leaderboardData.map((entry, index) => {
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
}
