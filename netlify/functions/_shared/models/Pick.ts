// Pick model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Pick, PickHistory, GameweekRoster } from '../../../../shared/types';

/** Per-gameweek roster stored in MongoDB (ObjectId version). */
export interface GameweekRosterDocument {
  golferIds: ObjectId[];
  captainId: ObjectId | null;
}

export interface PickDocument {
  _id: ObjectId;
  userId: ObjectId;
  golferIds: ObjectId[];
  captainId?: ObjectId | null;
  pendingGolferIds?: ObjectId[];
  pendingCaptainId?: ObjectId | null;
  pendingChangedAt?: Date;
  /** Per-gameweek roster snapshots. Key = gameweek number (as string). */
  gameweekRosters?: Record<string, GameweekRosterDocument>;
  /** Union of all golfer IDs that have ever been on this team. */
  allGolferIds?: ObjectId[];
  totalSpent: number;
  season: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPick(doc: PickDocument): Pick {
  // Convert gameweekRosters ObjectIds to strings
  let gameweekRosters: Record<string, GameweekRoster> | undefined;
  if (doc.gameweekRosters) {
    gameweekRosters = {};
    for (const [gw, roster] of Object.entries(doc.gameweekRosters)) {
      gameweekRosters[gw] = {
        golferIds: roster.golferIds.map((id) => id.toString()),
        captainId: roster.captainId?.toString() || null,
      };
    }
  }

  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    golferIds: doc.golferIds.map((id) => id.toString()),
    captainId: doc.captainId?.toString() || null,
    pendingGolferIds: doc.pendingGolferIds?.map((id) => id.toString()),
    pendingCaptainId:
      doc.pendingCaptainId !== undefined ? doc.pendingCaptainId?.toString() || null : undefined,
    pendingChangedAt: doc.pendingChangedAt,
    gameweekRosters,
    allGolferIds: doc.allGolferIds?.map((id) => id.toString()),
    totalSpent: doc.totalSpent,
    season: doc.season,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const PICKS_COLLECTION = 'picks';

// Pick History model
export interface PickHistoryDocument {
  _id: ObjectId;
  userId: ObjectId;
  golferIds: ObjectId[];
  captainId?: ObjectId | null;
  totalSpent: number;
  season: number;
  changedAt: Date;
  reason: string;
}

export function toPickHistory(doc: PickHistoryDocument): PickHistory {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    golferIds: doc.golferIds.map((id) => id.toString()),
    captainId: doc.captainId?.toString() || null,
    totalSpent: doc.totalSpent,
    season: doc.season,
    changedAt: doc.changedAt,
    reason: doc.reason,
  };
}

export const PICK_HISTORY_COLLECTION = 'pickHistory';
