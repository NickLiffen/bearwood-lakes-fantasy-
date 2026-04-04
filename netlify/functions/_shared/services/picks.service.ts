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
import { getWeekStart, hasUnlimitedTransfers as checkUnlimitedTransfers } from '../utils/dates';
import { getActiveSeason } from './seasons.service';

async function getCurrentSeason(): Promise<number> {
  const activeSeason = await getActiveSeason();
  return activeSeason
    ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
    : new Date().getFullYear();
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
  const activeSeason = await getActiveSeason();
  const firstGW = activeSeason?.firstGameweekStart
    ? new Date(activeSeason.firstGameweekStart)
    : null;
  const weekStart = getWeekStart(new Date(), firstGW);

  // Count pickHistory entries for this user since weekStart
  // Exclude initial picks (reason === 'Initial pick')
  const count = await db.collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION).countDocuments({
    userId: new ObjectId(userId),
    changedAt: { $gte: weekStart },
    reason: { $nin: ['Initial pick', 'Captain change', 'Scheduled captain change'] },
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
  captainId?: string | null,
  season?: number
): Promise<{ pick: Pick; deferred: boolean }> {
  const { db } = await connectToDatabase();
  const picksCollection = db.collection<PickDocument>(PICKS_COLLECTION);
  const historyCollection = db.collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION);
  const golfersCollection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

  // Check if transfers are open (for existing teams) or new team creation is allowed (for new teams)
  const existingPick = await getUserPicks(userId);
  let hasUnlimitedTransfers = true;
  let isCaptainOnlyChange = false;

  if (existingPick) {
    // Detect captain-only change (same golfers, different captain)
    const oldGolferIds = new Set(existingPick.golferIds.map((id) => id.toString()));
    const newGolferIds = new Set(golferIds);
    const isSameGolfers =
      oldGolferIds.size === newGolferIds.size &&
      [...oldGolferIds].every((id) => newGolferIds.has(id));
    isCaptainOnlyChange = isSameGolfers && captainId !== undefined;

    // Fetch all transfer-related settings in parallel
    const [transfersOpen, activeSeason, transfersUsed, maxTransfers, maxPlayersPerTransfer] =
      await Promise.all([
        areTransfersOpen(),
        getActiveSeason(),
        getTransfersThisWeek(userId),
        getMaxTransfersPerWeek(),
        getMaxPlayersPerTransfer(),
      ]);

    // Determine pre-season / unlimited transfers period
    const checkNow = new Date();
    const seasonStartDate = activeSeason?.startDate ? new Date(activeSeason.startDate) : null;
    const firstGW = activeSeason?.firstGameweekStart
      ? new Date(activeSeason.firstGameweekStart)
      : null;
    hasUnlimitedTransfers = checkUnlimitedTransfers(
      seasonStartDate,
      firstGW,
      existingPick.createdAt,
      checkNow
    );

    if (isCaptainOnlyChange) {
      // Captain-only changes: need transfersOpen when in-season, no transfer limit
      if (!hasUnlimitedTransfers && !transfersOpen) {
        throw new Error('Transfers are currently locked');
      }
    } else {
      // Golfer changes: always need transfersOpen
      if (!transfersOpen) {
        throw new Error('Transfers are currently locked');
      }

      if (!hasUnlimitedTransfers) {
        // Enforce weekly transfer limit
        if (transfersUsed >= maxTransfers) {
          throw new Error(
            `Transfer limit reached. You've used ${transfersUsed} of ${maxTransfers} transfer${maxTransfers === 1 ? '' : 's'} this week.`
          );
        }

        // Check how many players are being changed
        const removedCount = [...oldGolferIds].filter((id) => !newGolferIds.has(id)).length;
        const addedCount = [...newGolferIds].filter((id) => !oldGolferIds.has(id)).length;
        const playersChanged = Math.max(removedCount, addedCount);

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
  const currentSeason = season ?? (await getCurrentSeason());

  // Determine if this change should be deferred to the next gameweek
  const isDeferred = !!existingPick && !hasUnlimitedTransfers;

  // Determine the history reason
  let historyReason: string;
  if (!existingPick) {
    historyReason = 'Initial pick';
  } else if (isDeferred) {
    historyReason = isCaptainOnlyChange ? 'Scheduled captain change' : 'Scheduled transfer';
  } else {
    historyReason = isCaptainOnlyChange ? 'Captain change' : reason;
  }

  // Save to pick history for audit trail
  await historyCollection.insertOne({
    userId: userObjectId,
    golferIds: objectIds,
    totalSpent,
    season: currentSeason,
    changedAt: now,
    reason: historyReason,
  } as PickHistoryDocument);

  if (isDeferred) {
    // DEFERRED: write to pending fields only (applied at next gameweek)
    const setFields: Record<string, unknown> = {
      updatedAt: now,
      pendingChangedAt: now,
    };

    if (!isCaptainOnlyChange) {
      setFields.pendingGolferIds = objectIds;
    }

    if (captainId !== undefined) {
      setFields.pendingCaptainId = captainId ? new ObjectId(captainId) : null;
    }

    await picksCollection.updateOne(
      { userId: userObjectId, season: currentSeason },
      { $set: setFields }
    );
  } else {
    // IMMEDIATE: write to main fields and clear any pending fields
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
        $unset: {
          pendingGolferIds: '',
          pendingCaptainId: '',
          pendingChangedAt: '',
        },
      },
      { upsert: true }
    );
  }

  const pick = await getUserPicks(userId);
  return { pick: pick!, deferred: isDeferred };
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

/**
 * Cancel pending changes for a user (clears pendingGolferIds, pendingCaptainId, pendingChangedAt)
 */
export async function cancelPendingChanges(userId: string): Promise<void> {
  const { db } = await connectToDatabase();
  const activeSeason = await getActiveSeason();
  const currentSeason = activeSeason
    ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
    : new Date().getFullYear();
  const firstGW = activeSeason?.firstGameweekStart
    ? new Date(activeSeason.firstGameweekStart)
    : null;
  const weekStart = getWeekStart(new Date(), firstGW);
  const userObjectId = new ObjectId(userId);

  // Clear pending fields on the picks document
  await db.collection<PickDocument>(PICKS_COLLECTION).updateOne(
    { userId: userObjectId, season: currentSeason },
    {
      $unset: { pendingGolferIds: '', pendingCaptainId: '', pendingChangedAt: '' },
      $set: { updatedAt: new Date() },
    }
  );

  // Remove scheduled history entries for the current week so the transfer count resets
  await db.collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION).deleteMany({
    userId: userObjectId,
    season: currentSeason,
    changedAt: { $gte: weekStart },
    reason: { $in: ['Scheduled transfer', 'Scheduled captain change'] },
  });
}

/**
 * Apply pending changes if the gameweek boundary has passed.
 * Call this before reading/scoring a pick to ensure the active team is current.
 * Returns true if changes were applied.
 */
export async function applyPendingChanges(userId: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const currentSeason = await getCurrentSeason();
  const activeSeason = await getActiveSeason();
  const firstGW = activeSeason?.firstGameweekStart
    ? new Date(activeSeason.firstGameweekStart)
    : null;

  const pick = await db.collection<PickDocument>(PICKS_COLLECTION).findOne({
    userId: new ObjectId(userId),
    season: currentSeason,
  });

  if (!pick?.pendingChangedAt) return false;

  // Check if the pending change was made before the current week started
  const weekStart = getWeekStart(new Date(), firstGW);
  if (pick.pendingChangedAt >= weekStart) return false; // Still in the same week

  // Apply pending changes to main fields
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  const updateUnset: Record<string, string> = {};

  if (pick.pendingGolferIds && pick.pendingGolferIds.length > 0) {
    updateSet.golferIds = pick.pendingGolferIds;
    // Recalculate totalSpent from pending golfers
    const golfers = await db
      .collection('golfers')
      .find({ _id: { $in: pick.pendingGolferIds } })
      .toArray();
    updateSet.totalSpent = golfers.reduce((sum, g) => sum + (g.price || 0), 0);

    // If captain was swapped out and no pendingCaptainId set, reassign to first golfer
    if (pick.captainId && pick.pendingCaptainId === undefined) {
      const captainStillOnTeam = pick.pendingGolferIds.some(
        (id) => id.toString() === pick.captainId?.toString()
      );
      if (!captainStillOnTeam) {
        updateSet.captainId = pick.pendingGolferIds[0];
      }
    }
  }

  if (pick.pendingCaptainId !== undefined) {
    updateSet.captainId = pick.pendingCaptainId;
  }

  // Clear pending fields
  updateUnset.pendingGolferIds = '';
  updateUnset.pendingCaptainId = '';
  updateUnset.pendingChangedAt = '';

  await db
    .collection<PickDocument>(PICKS_COLLECTION)
    .updateOne({ _id: pick._id }, { $set: updateSet, $unset: updateUnset });

  return true;
}

// Backwards compatibility alias
export const getUserPicksWithPlayers = getUserPicksWithGolfers;
