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
import { getWeekStart, getTeamEffectiveStartDate } from '../utils/dates';
import { getActiveSeason } from './seasons.service';

async function getCurrentSeason(): Promise<number> {
  const activeSeason = await getActiveSeason();
  return activeSeason ? (parseInt(activeSeason.name, 10) || new Date().getFullYear()) : new Date().getFullYear();
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

async function getMaxTransfersPerWeek(): Promise<number> {
  const { db } = await connectToDatabase();
  const setting = await db
    .collection<SettingDocument>(SETTINGS_COLLECTION)
    .findOne({ key: 'maxTransfersPerWeek' });
  return (setting?.value as number) || 1;
}

async function getMaxPlayersPerTransfer(): Promise<number> {
  const { db } = await connectToDatabase();
  const setting = await db
    .collection<SettingDocument>(SETTINGS_COLLECTION)
    .findOne({ key: 'maxPlayersPerTransfer' });
  return (setting?.value as number) || 6; // Default to 6 (full team)
}

export async function getTransfersThisWeek(userId: string): Promise<number> {
  const { db } = await connectToDatabase();
  const weekStart = getWeekStart(new Date());

  // Count pickHistory entries for this user since weekStart
  // Exclude initial picks (reason === 'Initial pick')
  const count = await db
    .collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION)
    .countDocuments({
      userId: new ObjectId(userId),
      changedAt: { $gte: weekStart },
      reason: { $ne: 'Initial pick' },
    });

  return count;
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
    isActive: g.isActive,
    stats2025: g.stats2025 || {
      timesBonusScored: 0,
      timesFinished1st: 0,
      timesFinished2nd: 0,
      timesFinished3rd: 0,
      timesPlayed: 0,
    },
    stats2026: g.stats2026 || {
      timesBonusScored: 0,
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
  reason: string = 'Team selection',
  captainId?: string | null
): Promise<Pick> {
  const { db } = await connectToDatabase();
  const picksCollection = db.collection<PickDocument>(PICKS_COLLECTION);
  const historyCollection = db.collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION);
  const golfersCollection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

  // Check if transfers are open (for existing teams) or new team creation is allowed (for new teams)
  const existingPick = await getUserPicks(userId);
  if (existingPick) {
    // Check if this is ONLY a captain change (same golfers, different captain)
    const oldGolferIds = new Set(existingPick.golferIds.map(id => id.toString()));
    const newGolferIds = new Set(golferIds);
    const isSameGolfers = oldGolferIds.size === newGolferIds.size &&
      [...oldGolferIds].every(id => newGolferIds.has(id));

    const isCaptainOnlyChange = isSameGolfers && captainId !== undefined;

    // Captain changes are always allowed, but golfer changes require transfers to be open
    if (!isCaptainOnlyChange) {
      // User has an existing team and is changing golfers - this is a transfer
      const transfersOpen = await areTransfersOpen();
      if (!transfersOpen) {
        throw new Error('Transfers are currently locked');
      }

      // Check if we're in an unlimited transfer period:
      // 1. Before the season starts (pre-season setup)
      // 2. Before the team's first game week (grace period after creation)
      const now = new Date();
      const activeSeason = await getActiveSeason();
      const seasonStartDate = activeSeason?.startDate ? new Date(activeSeason.startDate) : null;
      const teamEffectiveStart = getTeamEffectiveStartDate(existingPick.createdAt);
      const isPreSeason = seasonStartDate && now < seasonStartDate;
      const isPreFirstGameWeek = now < teamEffectiveStart;
      const hasUnlimitedTransfers = isPreSeason || isPreFirstGameWeek;

      if (!hasUnlimitedTransfers) {
        // Enforce weekly transfer limit
        const maxTransfers = await getMaxTransfersPerWeek();
        const transfersUsed = await getTransfersThisWeek(userId);

        if (transfersUsed >= maxTransfers) {
          throw new Error(`Transfer limit reached. You've used ${transfersUsed} of ${maxTransfers} transfer${maxTransfers === 1 ? '' : 's'} this week.`);
        }

        // Check how many players are being changed
        const removedCount = [...oldGolferIds].filter(id => !newGolferIds.has(id)).length;
        const addedCount = [...newGolferIds].filter(id => !oldGolferIds.has(id)).length;
        const playersChanged = Math.max(removedCount, addedCount);

        const maxPlayersPerTransfer = await getMaxPlayersPerTransfer();

        if (playersChanged > maxPlayersPerTransfer) {
          throw new Error(
            `You can only swap ${maxPlayersPerTransfer} golfer${maxPlayersPerTransfer === 1 ? '' : 's'} per transfer. ` +
            `You're trying to change ${playersChanged}.`
          );
        }
      }
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

  // Validate captain is in selected golfers
  if (captainId && !golferIds.includes(captainId)) {
    throw new Error('Captain must be one of your selected golfers');
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
        captainId: captainId ? new ObjectId(captainId) : null,
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
