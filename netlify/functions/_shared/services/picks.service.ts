// Picks service - manage user team selections

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  PickDocument,
  toPick,
  PICKS_COLLECTION,
  PickHistoryDocument,
  PICK_HISTORY_COLLECTION,
} from '../models/Pick';
import { PlayerDocument, PLAYERS_COLLECTION } from '../models/Player';
import { SettingDocument, SETTINGS_COLLECTION } from '../models/Settings';
import { BUDGET_CAP, MAX_PLAYERS } from '../../../../shared/constants/rules';
import type { Pick, PickWithPlayers, PickHistory } from '../../../../shared/types';

async function getCurrentSeason(): Promise<number> {
  const { db } = await connectToDatabase();
  const setting = await db
    .collection<SettingDocument>(SETTINGS_COLLECTION)
    .findOne({ key: 'currentSeason' });
  return (setting?.value as number) || 2026;
}

async function areTransfersOpen(): Promise<boolean> {
  const { db } = await connectToDatabase();
  const setting = await db
    .collection<SettingDocument>(SETTINGS_COLLECTION)
    .findOne({ key: 'transfersOpen' });
  return (setting?.value as boolean) || false;
}

async function isNewTeamCreationAllowed(): Promise<boolean> {
  const { db } = await connectToDatabase();
  const setting = await db
    .collection<SettingDocument>(SETTINGS_COLLECTION)
    .findOne({ key: 'allowNewTeamCreation' });
  // Default to true if not set
  return setting?.value !== undefined ? (setting.value as boolean) : true;
}

export async function getUserPicks(userId: string, season?: number): Promise<Pick | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PickDocument>(PICKS_COLLECTION);

  const currentSeason = season ?? (await getCurrentSeason());
  const pick = await collection.findOne({
    userId: new ObjectId(userId),
    season: currentSeason,
  });
  return pick ? toPick(pick) : null;
}

export async function getUserPicksWithPlayers(userId: string): Promise<PickWithPlayers | null> {
  const { db } = await connectToDatabase();

  const pick = await getUserPicks(userId);
  if (!pick) return null;

  // Get players for this pick
  const playersCollection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);
  const playerIds = pick.playerIds.map((id) => new ObjectId(id));
  const players = await playersCollection.find({ _id: { $in: playerIds } }).toArray();

  const playerMap = players.map((p) => ({
    id: p._id.toString(),
    firstName: p.firstName,
    lastName: p.lastName,
    picture: p.picture,
    price: p.price,
    membershipType: p.membershipType || 'men',
    isActive: p.isActive,
    stats2025: p.stats2025 || {
      timesScored36Plus: 0,
      timesFinished1st: 0,
      timesFinished2nd: 0,
      timesFinished3rd: 0,
      timesPlayed: 0,
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  return { ...pick, players: playerMap };
}

export async function savePicks(
  userId: string,
  playerIds: string[],
  reason: string = 'Team selection'
): Promise<Pick> {
  const { db } = await connectToDatabase();
  const picksCollection = db.collection<PickDocument>(PICKS_COLLECTION);
  const historyCollection = db.collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION);
  const playersCollection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);

  // Check if transfers are open (for existing teams) or new team creation is allowed (for new teams)
  const existingPick = await getUserPicks(userId);
  if (existingPick) {
    // User has an existing team - this is a transfer
    const transfersOpen = await areTransfersOpen();
    if (!transfersOpen) {
      throw new Error('Transfers are currently locked');
    }
  } else {
    // User doesn't have a team - this is initial creation
    const newTeamAllowed = await isNewTeamCreationAllowed();
    if (!newTeamAllowed) {
      throw new Error('New team creation is currently disabled');
    }
  }

  // Validate player count
  if (playerIds.length !== MAX_PLAYERS) {
    throw new Error(`You must select exactly ${MAX_PLAYERS} players`);
  }

  // Check for duplicates
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Duplicate players are not allowed');
  }

  // Get players and calculate total
  const objectIds = playerIds.map((id) => new ObjectId(id));
  const players = await playersCollection.find({ _id: { $in: objectIds } }).toArray();

  if (players.length !== playerIds.length) {
    throw new Error('One or more players not found');
  }

  const totalSpent = players.reduce((sum, p) => sum + p.price, 0);

  if (totalSpent > BUDGET_CAP) {
    throw new Error(`Budget exceeded. Maximum is $${BUDGET_CAP / 1_000_000}M`);
  }

  const now = new Date();
  const userObjectId = new ObjectId(userId);
  const currentSeason = await getCurrentSeason();

  // Save to pick history for audit trail
  await historyCollection.insertOne({
    userId: userObjectId,
    playerIds: objectIds,
    totalSpent,
    season: currentSeason,
    changedAt: now,
    reason: existingPick ? reason : 'Initial pick',
  } as PickHistoryDocument);

  // Upsert the current pick
  await picksCollection.updateOne(
    { userId: userObjectId, season: currentSeason },
    {
      $set: {
        playerIds: objectIds,
        totalSpent,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: userObjectId,
        season: currentSeason,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const pick = await getUserPicks(userId);
  return pick!;
}

export async function getPickHistory(userId: string): Promise<PickHistory[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION);

  const history = await collection
    .find({ userId: new ObjectId(userId) })
    .sort({ changedAt: -1 })
    .toArray();

  return history.map((doc) => ({
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    playerIds: doc.playerIds.map((id) => id.toString()),
    totalSpent: doc.totalSpent,
    season: doc.season,
    changedAt: doc.changedAt,
    reason: doc.reason,
  }));
}
