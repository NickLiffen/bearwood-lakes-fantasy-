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
import { GolferDocument, GOLFERS_COLLECTION } from '../models/Golfer';
import { SettingDocument, SETTINGS_COLLECTION } from '../models/Settings';
import { BUDGET_CAP, MAX_GOLFERS } from '../../../../shared/constants/rules';
import type { Pick, PickWithGolfers, PickHistory } from '../../../../shared/types';

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

export async function getUserPicksWithGolfers(userId: string): Promise<PickWithGolfers | null> {
  const { db } = await connectToDatabase();

  const pick = await getUserPicks(userId);
  if (!pick) return null;

  // Get golfers for this pick
  const golfersCollection = db.collection<GolferDocument>(GOLFERS_COLLECTION);
  const golferIds = pick.golferIds.map((id) => new ObjectId(id));
  const golfers = await golfersCollection.find({ _id: { $in: golferIds } }).toArray();

  const golferMap = golfers.map((g) => ({
    id: g._id.toString(),
    firstName: g.firstName,
    lastName: g.lastName,
    picture: g.picture,
    price: g.price,
    membershipType: g.membershipType || 'men',
    isActive: g.isActive,
    stats2025: g.stats2025 || {
      timesScored36Plus: 0,
      timesFinished1st: 0,
      timesFinished2nd: 0,
      timesFinished3rd: 0,
      timesPlayed: 0,
    },
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }));

  return { ...pick, golfers: golferMap };
}

export async function savePicks(
  userId: string,
  golferIds: string[],
  reason: string = 'Team selection'
): Promise<Pick> {
  const { db } = await connectToDatabase();
  const picksCollection = db.collection<PickDocument>(PICKS_COLLECTION);
  const historyCollection = db.collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION);
  const golfersCollection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

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

  // Validate golfer count
  if (golferIds.length !== MAX_GOLFERS) {
    throw new Error(`You must select exactly ${MAX_GOLFERS} golfers`);
  }

  // Check for duplicates
  if (new Set(golferIds).size !== golferIds.length) {
    throw new Error('Duplicate golfers are not allowed');
  }

  // Get golfers and calculate total
  const objectIds = golferIds.map((id) => new ObjectId(id));
  const golfers = await golfersCollection.find({ _id: { $in: objectIds } }).toArray();

  if (golfers.length !== golferIds.length) {
    throw new Error('One or more golfers not found');
  }

  const totalSpent = golfers.reduce((sum, g) => sum + g.price, 0);

  if (totalSpent > BUDGET_CAP) {
    throw new Error(`Budget exceeded. Maximum is $${BUDGET_CAP / 1_000_000}M`);
  }

  const now = new Date();
  const userObjectId = new ObjectId(userId);
  const currentSeason = await getCurrentSeason();

  // Save to pick history for audit trail
  await historyCollection.insertOne({
    userId: userObjectId,
    golferIds: objectIds,
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
        golferIds: objectIds,
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
    golferIds: doc.golferIds.map((id) => id.toString()),
    totalSpent: doc.totalSpent,
    season: doc.season,
    changedAt: doc.changedAt,
    reason: doc.reason,
  }));
}

// Backwards compatibility alias
export const getUserPicksWithPlayers = getUserPicksWithGolfers;
