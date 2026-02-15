// Leaderboard service - calculate rankings

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { UserDocument, USERS_COLLECTION } from '../models/User';
import { PickDocument, PICKS_COLLECTION } from '../models/Pick';
import { ScoreDocument, SCORES_COLLECTION } from '../models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import type { LeaderboardEntry } from '../../../../shared/types';
import { getWeekStart, getWeekEnd, getMonthStart, getMonthEnd, getSeasonStart, getTeamEffectiveStartDate } from '../utils/dates';
import { getActiveSeason } from './seasons.service';

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
  const activeSeason = await getActiveSeason();
  return activeSeason ? (parseInt(activeSeason.name, 10) || new Date().getFullYear()) : new Date().getFullYear();
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
    const emptyWeekStart = getWeekStart();
    return {
      season: [],
      month: [],
      week: [],
      currentMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
      weekStart: emptyWeekStart.toISOString(),
      weekEnd: getWeekEnd(emptyWeekStart).toISOString(),
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
  
  // Create a map of golfer scores by tournament
  const scoresByGolferAndTournament = new Map<string, Map<string, ScoreDocument>>();
  for (const score of allScores) {
    const golferId = score.golferId.toString();
    if (!scoresByGolferAndTournament.has(golferId)) {
      scoresByGolferAndTournament.set(golferId, new Map());
    }
    scoresByGolferAndTournament.get(golferId)!.set(score.tournamentId.toString(), score);
  }
  
  // Date ranges
  const seasonStart = getSeasonStart();
  const monthStart = getMonthStart();
  const monthEnd = getMonthEnd();
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd(weekStart);
  
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

    // Team only earns points from tournaments starting on or after their effective start date
    const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt);

    let seasonPoints = 0;
    let monthPoints = 0;
    let weekPoints = 0;
    const seasonTournamentSet = new Set<string>();
    const monthTournamentSet = new Set<string>();
    const weekTournamentSet = new Set<string>();

    // Calculate points for each golfer in the user's team
    const captainIdString = pick.captainId?.toString();
    for (const golferId of pick.golferIds) {
      const golferScores = scoresByGolferAndTournament.get(golferId.toString());
      if (!golferScores) continue;

      const isCaptain = golferId.toString() === captainIdString;
      const captainMultiplier = isCaptain ? 2 : 1;

      for (const [tournamentId, score] of golferScores) {
        const tournament = tournamentMap.get(tournamentId);
        if (!tournament) continue;

        const tournamentDate = new Date(tournament.startDate);

        // Skip tournaments before team's effective start date
        if (tournamentDate < teamEffectiveStart) continue;

        const points = (score.multipliedPoints || 0) * captainMultiplier;

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

  // Create tournament date lookup
  const tournamentDateMap = new Map<string, Date>();
  for (const t of publishedTournaments) {
    tournamentDateMap.set(t._id.toString(), new Date(t.startDate));
  }

  // Get all scores from published tournaments
  const scores = await db
    .collection<ScoreDocument>(SCORES_COLLECTION)
    .find({ tournamentId: { $in: publishedTournamentIds } })
    .toArray();

  // Build a map of golferId -> tournamentId -> points (for filtering by date)
  const golferScoresByTournament = new Map<string, Map<string, number>>();
  for (const score of scores) {
    const golferId = score.golferId.toString();
    const tournamentId = score.tournamentId.toString();
    if (!golferScoresByTournament.has(golferId)) {
      golferScoresByTournament.set(golferId, new Map());
    }
    golferScoresByTournament.get(golferId)!.set(tournamentId, score.multipliedPoints);
  }

  // Create a map of picks by userId for faster lookup
  const pickMap = new Map(picks.map(p => [p.userId.toString(), p]));

  // Calculate total points for each user based on their picks
  const leaderboardData: Array<{ userId: string; username: string; totalPoints: number }> = [];

  for (const user of users) {
    const userPick = pickMap.get(user._id.toString());

    let totalPoints = 0;
    if (userPick) {
      // Team only earns points from tournaments after their effective start date
      const teamEffectiveStart = getTeamEffectiveStartDate(userPick.createdAt);
      const captainIdString = userPick.captainId?.toString();

      for (const golferId of userPick.golferIds) {
        const golferTournamentScores = golferScoresByTournament.get(golferId.toString());
        if (!golferTournamentScores) continue;

        const isCaptain = golferId.toString() === captainIdString;
        const captainMultiplier = isCaptain ? 2 : 1;

        for (const [tournamentId, points] of golferTournamentScores) {
          const tournamentDate = tournamentDateMap.get(tournamentId);
          // Skip tournaments before team's effective start date
          if (tournamentDate && tournamentDate < teamEffectiveStart) continue;
          totalPoints += points * captainMultiplier;
        }
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

  const tournamentDate = new Date(tournament.startDate);

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

  // Build a map of golferId -> points for this tournament
  const golferPointsMap = new Map<string, number>();
  for (const score of scores) {
    golferPointsMap.set(score.golferId.toString(), score.multipliedPoints);
  }

  // Create a map of picks by userId for faster lookup
  const pickMap = new Map(picks.map(p => [p.userId.toString(), p]));

  // Calculate points for each user
  const leaderboardData: Array<{ userId: string; username: string; totalPoints: number }> = [];

  for (const user of users) {
    const userPick = pickMap.get(user._id.toString());

    let totalPoints = 0;
    if (userPick) {
      // Check if team's effective start date allows them to earn points from this tournament
      const teamEffectiveStart = getTeamEffectiveStartDate(userPick.createdAt);
      const captainIdString = userPick.captainId?.toString();

      // Only include points if tournament is on or after team's effective start date
      if (tournamentDate >= teamEffectiveStart) {
        for (const golferId of userPick.golferIds) {
          const isCaptain = golferId.toString() === captainIdString;
          const captainMultiplier = isCaptain ? 2 : 1;
          totalPoints += (golferPointsMap.get(golferId.toString()) || 0) * captainMultiplier;
        }
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
