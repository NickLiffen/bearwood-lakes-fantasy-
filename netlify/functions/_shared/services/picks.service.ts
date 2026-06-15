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
import { BUDGET_CAP, MAX_GOLFERS, UNLIMITED_TRANSFER_GAMEWEEKS } from '@shared/constants/rules';
import type { Pick, PickWithGolfers, PickHistory } from '../../../../shared/types';
import {
  getWeekStart,
  getGameweekNumber,
  hasUnlimitedTransfers as checkUnlimitedTransfers,
  getTransferDeadline,
} from '../utils/dates';
import { getActiveSeason } from './seasons.service';
import type { GameweekRosterDocument } from '../models/Pick';

async function getCurrentSeason(): Promise<number> {
  const activeSeason = await getActiveSeason();
  return activeSeason
    ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
    : new Date().getFullYear();
}

/**
 * Compute the current gameweek number from the active season.
 */
async function getCurrentGameweekNumber(): Promise<number> {
  const activeSeason = await getActiveSeason();
  if (!activeSeason) return 1;
  const firstGW = activeSeason.firstGameweekStart
    ? new Date(activeSeason.firstGameweekStart)
    : null;
  const seasonStartDate = new Date(activeSeason.startDate);
  const now = new Date();
  const weekStart = getWeekStart(now, firstGW);
  return getGameweekNumber(weekStart, seasonStartDate, firstGW);
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
  const now = new Date();
  const weekStart = getWeekStart(now, firstGW);

  // Count transfers since the most recent transfer deadline (8am UK Saturday).
  // Between Saturday midnight and 8am, the current week's deadline is in the
  // future, so we use the previous week's deadline instead.
  const thisWeekDeadline = getTransferDeadline(weekStart);
  const previousWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowStart =
    now < thisWeekDeadline ? getTransferDeadline(previousWeekStart) : thisWeekDeadline;

  const count = await db.collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION).countDocuments({
    userId: new ObjectId(userId),
    changedAt: { $gte: windowStart },
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
    const isSameAsActive =
      oldGolferIds.size === newGolferIds.size &&
      [...oldGolferIds].every((id) => newGolferIds.has(id));

    // Also match against pending golfer IDs so that setting captain on a
    // pending-added golfer is treated as a captain-only change (no extra transfer)
    const pendingIds = existingPick.pendingGolferIds?.map((id) => id.toString());
    const pendingIdSet = pendingIds ? new Set(pendingIds) : null;
    const isSameAsPending =
      pendingIdSet !== null &&
      pendingIdSet.size === newGolferIds.size &&
      [...pendingIdSet].every((id) => newGolferIds.has(id));

    const isSameGolfers = isSameAsActive || isSameAsPending;
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

    // One-off promo weeks (e.g. GW12 for the Club Champs run) lift the transfer limits
    // while STILL deferring the change to the next gameweek. This is distinct from
    // `hasUnlimitedTransfers`, which also applies changes immediately (pre-season).
    const currentWeekStart = getWeekStart(checkNow, firstGW);
    const currentGameweek = seasonStartDate
      ? getGameweekNumber(currentWeekStart, seasonStartDate, firstGW)
      : null;
    const isUnlimitedGameweek =
      currentGameweek != null && UNLIMITED_TRANSFER_GAMEWEEKS.includes(currentGameweek);

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

      if (!hasUnlimitedTransfers && !isUnlimitedGameweek) {
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

  // Save to pick history for audit trail (now includes captainId)
  await historyCollection.insertOne({
    userId: userObjectId,
    golferIds: objectIds,
    captainId: captainId ? new ObjectId(captainId) : null,
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
    // Also set gameweekRosters and allGolferIds for correct historical scoring
    const currentGW = await getCurrentGameweekNumber();
    const gwKey = String(currentGW);

    // Resolve the captainId to persist. Rules (mirroring the apply path):
    //   - explicit non-null → honor it
    //   - undefined or null → try to preserve the existing captain if still on team
    //   - else → auto-assign golferIds[0] so we never write captainId:null on a
    //     non-empty team. This is the backstop that prevents the legacy
    //     "no-captain" bug from re-surfacing through the immediate save path
    //     (initial team creation, unlimited-transfers saves).
    let captainObjectId: ObjectId | null;
    if (captainId) {
      captainObjectId = new ObjectId(captainId);
    } else {
      const existingCaptainStr = existingPick?.captainId?.toString();
      const existingCaptainStillOnTeam =
        existingCaptainStr && golferIds.includes(existingCaptainStr);
      if (existingCaptainStillOnTeam) {
        captainObjectId = new ObjectId(existingCaptainStr);
      } else if (objectIds.length > 0) {
        captainObjectId = objectIds[0];
      } else {
        captainObjectId = null;
      }
    }

    const rosterEntry: GameweekRosterDocument = {
      golferIds: objectIds,
      captainId: captainObjectId,
    };

    // Build allGolferIds: union of existing + new
    const existingAllIds = existingPick?.allGolferIds
      ? existingPick.allGolferIds.map((id: string) => id)
      : existingPick?.golferIds.map((id: string) => id) || [];
    const newIds = golferIds;
    const allIdsSet = new Set([...existingAllIds, ...newIds]);
    const allGolferIds = Array.from(allIdsSet).map((id) => new ObjectId(id));

    await picksCollection.updateOne(
      { userId: userObjectId, season: currentSeason },
      {
        $set: {
          golferIds: objectIds,
          captainId: captainObjectId,
          totalSpent,
          updatedAt: now,
          [`gameweekRosters.${gwKey}`]: rosterEntry,
          allGolferIds,
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
  const now = new Date();
  const weekStart = getWeekStart(now, firstGW);
  const userObjectId = new ObjectId(userId);

  // Use the same deadline-based window as getTransfersThisWeek()
  const thisWeekDeadline = getTransferDeadline(weekStart);
  const previousWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowStart =
    now < thisWeekDeadline ? getTransferDeadline(previousWeekStart) : thisWeekDeadline;

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
    changedAt: { $gte: windowStart },
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

  // Check if the current week's transfer deadline has passed before applying.
  // The week boundary is midnight Saturday, but the user-facing transfer deadline
  // is 8am UK local time on Saturday. Don't apply until the deadline has actually passed.
  const now = new Date();
  const weekStart = getWeekStart(now, firstGW);
  const transferDeadline = getTransferDeadline(weekStart);
  if (now < transferDeadline) return false; // Deadline hasn't passed yet
  if (pick.pendingChangedAt >= transferDeadline) return false; // Changed after deadline

  // Apply pending changes to main fields
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  const updateUnset: Record<string, string> = {};

  // Determine the new gameweek number for the roster snapshot
  const seasonStartDate = activeSeason?.startDate ? new Date(activeSeason.startDate) : null;
  const currentGW = getGameweekNumber(weekStart, seasonStartDate || new Date(), firstGW);
  const gwKey = String(currentGW);

  // Determine the new golferIds and captainId
  let newGolferIds = pick.golferIds;
  let newCaptainId = pick.captainId || null;

  if (pick.pendingGolferIds && pick.pendingGolferIds.length > 0) {
    newGolferIds = pick.pendingGolferIds;
    updateSet.golferIds = pick.pendingGolferIds;
    // Recalculate totalSpent from pending golfers
    const golfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: pick.pendingGolferIds } })
      .toArray();
    updateSet.totalSpent = golfers.reduce((sum, g) => sum + (g.price || 0), 0);

    // If captain was swapped out and no explicit captain selection, reassign to first golfer.
    // Covers both: pendingCaptainId missing (undefined) and pendingCaptainId explicitly null.
    // The explicit-null case happens when a UI accidentally sends null (historic bug) or
    // when a transfer removes the current captain without the user picking a new one.
    if (pick.captainId && pick.pendingCaptainId == null) {
      const captainStillOnTeam = pick.pendingGolferIds.some(
        (id) => id.toString() === pick.captainId?.toString()
      );
      if (!captainStillOnTeam) {
        newCaptainId = pick.pendingGolferIds[0];
        updateSet.captainId = pick.pendingGolferIds[0];
      }
    }
  }

  if (pick.pendingCaptainId != null) {
    // Explicit non-null captain selection — honor it.
    newCaptainId = pick.pendingCaptainId;
    updateSet.captainId = pick.pendingCaptainId;
  }

  // Final safety check: apply must never leave a team with no captain.
  // If captainId would end up null but we have golferIds, auto-assign the first golfer.
  // This catches edge cases like pendingCaptainId: null with no pendingGolferIds,
  // or any future bug that clears captain without a replacement.
  if (!updateSet.captainId && newGolferIds.length > 0) {
    if (newCaptainId == null || !newGolferIds.some((id) => id.toString() === newCaptainId?.toString())) {
      newCaptainId = newGolferIds[0];
      updateSet.captainId = newGolferIds[0];
    }
  }

  // Set the gameweek roster snapshot for the new gameweek
  const rosterEntry: GameweekRosterDocument = {
    golferIds: newGolferIds,
    captainId: newCaptainId,
  };
  updateSet[`gameweekRosters.${gwKey}`] = rosterEntry;

  // Update allGolferIds: union of existing + new golfers
  const existingAllIds = new Set((pick.allGolferIds || pick.golferIds).map((id) => id.toString()));
  for (const id of newGolferIds) {
    existingAllIds.add(id.toString());
  }
  updateSet.allGolferIds = Array.from(existingAllIds).map((id) => new ObjectId(id));

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

/**
 * Apply pending changes for ALL users whose pendingChangedAt is before the
 * current week's transfer deadline (8am Saturday).
 *
 * Used by the scheduled function and admin endpoint to ensure transfers are
 * applied even if users haven't visited their team page.
 *
 * Returns the count of picks that had pending changes applied.
 */
export async function applyAllPendingChanges(): Promise<{
  applied: number;
  total: number;
  details: Array<{ userId: string; pendingChangedAt: Date }>;
}> {
  const { db } = await connectToDatabase();
  const currentSeason = await getCurrentSeason();
  const activeSeason = await getActiveSeason();
  const firstGW = activeSeason?.firstGameweekStart
    ? new Date(activeSeason.firstGameweekStart)
    : null;

  const now = new Date();
  const weekStart = getWeekStart(now, firstGW);
  const transferDeadline = getTransferDeadline(weekStart);

  // Don't apply anything until the deadline has actually passed
  if (now < transferDeadline) {
    return { applied: 0, total: 0, details: [] };
  }

  // Find all picks with pending changes submitted before the transfer deadline
  const picksWithPending = await db
    .collection<PickDocument>(PICKS_COLLECTION)
    .find({
      season: currentSeason,
      pendingChangedAt: { $exists: true, $lt: transferDeadline },
    })
    .toArray();

  const total = picksWithPending.length;
  if (total === 0) {
    return { applied: 0, total: 0, details: [] };
  }

  // Batch-fetch all pending golfers in one query to avoid N+1
  const allPendingGolferIds = new Set<string>();
  for (const pick of picksWithPending) {
    if (pick.pendingGolferIds) {
      for (const id of pick.pendingGolferIds) {
        allPendingGolferIds.add(id.toString());
      }
    }
  }

  const golferPriceMap = new Map<string, number>();
  if (allPendingGolferIds.size > 0) {
    const golfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: Array.from(allPendingGolferIds).map((id) => new ObjectId(id)) } })
      .project<{ _id: ObjectId; price: number }>({ price: 1 })
      .toArray();
    for (const g of golfers) {
      golferPriceMap.set(g._id.toString(), g.price || 0);
    }
  }

  // Determine the current gameweek for roster snapshots
  const seasonStartDate = activeSeason?.startDate ? new Date(activeSeason.startDate) : null;
  const currentGW = getGameweekNumber(weekStart, seasonStartDate || new Date(), firstGW);
  const gwKey = String(currentGW);

  let applied = 0;
  const details: Array<{ userId: string; pendingChangedAt: Date }> = [];

  for (const pick of picksWithPending) {
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    const updateUnset: Record<string, string> = {};

    let newGolferIds = pick.golferIds;
    let newCaptainId = pick.captainId || null;

    if (pick.pendingGolferIds && pick.pendingGolferIds.length > 0) {
      newGolferIds = pick.pendingGolferIds;
      updateSet.golferIds = pick.pendingGolferIds;
      updateSet.totalSpent = pick.pendingGolferIds.reduce(
        (sum, id) => sum + (golferPriceMap.get(id.toString()) || 0),
        0
      );

      // If captain was swapped out and no explicit captain selection, reassign to first golfer.
      // Covers both: pendingCaptainId missing (undefined) and pendingCaptainId explicitly null.
      if (pick.captainId && pick.pendingCaptainId == null) {
        const captainStillOnTeam = pick.pendingGolferIds.some(
          (id) => id.toString() === pick.captainId?.toString()
        );
        if (!captainStillOnTeam) {
          newCaptainId = pick.pendingGolferIds[0];
          updateSet.captainId = pick.pendingGolferIds[0];
        }
      }
    }

    if (pick.pendingCaptainId != null) {
      // Explicit non-null captain selection — honor it.
      newCaptainId = pick.pendingCaptainId;
      updateSet.captainId = pick.pendingCaptainId;
    }

    // Final safety check: apply must never leave a team with no captain.
    if (!updateSet.captainId && newGolferIds.length > 0) {
      if (newCaptainId == null || !newGolferIds.some((id) => id.toString() === newCaptainId?.toString())) {
        newCaptainId = newGolferIds[0];
        updateSet.captainId = newGolferIds[0];
      }
    }

    // Set gameweek roster snapshot
    const rosterEntry: GameweekRosterDocument = {
      golferIds: newGolferIds,
      captainId: newCaptainId,
    };
    updateSet[`gameweekRosters.${gwKey}`] = rosterEntry;

    // Update allGolferIds: union of existing + new
    const existingAllIds = new Set(
      (pick.allGolferIds || pick.golferIds).map((id) => id.toString())
    );
    for (const id of newGolferIds) {
      existingAllIds.add(id.toString());
    }
    updateSet.allGolferIds = Array.from(existingAllIds).map((id) => new ObjectId(id));

    // Clear pending fields
    updateUnset.pendingGolferIds = '';
    updateUnset.pendingCaptainId = '';
    updateUnset.pendingChangedAt = '';

    await db
      .collection<PickDocument>(PICKS_COLLECTION)
      .updateOne({ _id: pick._id }, { $set: updateSet, $unset: updateUnset });

    applied++;
    details.push({
      userId: pick.userId.toString(),
      pendingChangedAt: pick.pendingChangedAt!,
    });
  }

  return { applied, total, details };
}
