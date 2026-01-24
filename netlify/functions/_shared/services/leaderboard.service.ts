// Leaderboard service - calculate rankings

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { UserDocument, USERS_COLLECTION } from '../models/User';
import { PickDocument, PICKS_COLLECTION } from '../models/Pick';
import { ScoreDocument, SCORES_COLLECTION } from '../models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from '../models/Settings';
import type { LeaderboardEntry } from '../../../../shared/types';

async function getCurrentSeason(): Promise<number> {
  const { db } = await connectToDatabase();
  const setting = await db
    .collection<SettingDocument>(SETTINGS_COLLECTION)
    .findOne({ key: 'currentSeason' });
  return (setting?.value as number) || 2026;
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
