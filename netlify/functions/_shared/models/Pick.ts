// Pick model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Pick, PickHistory } from '../../../../shared/types';

export interface PickDocument {
  _id: ObjectId;
  userId: ObjectId;
  playerIds: ObjectId[];
  totalSpent: number;
  season: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPick(doc: PickDocument): Pick {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    playerIds: doc.playerIds.map((id) => id.toString()),
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
  playerIds: ObjectId[];
  totalSpent: number;
  season: number;
  changedAt: Date;
  reason: string;
}

export function toPickHistory(doc: PickHistoryDocument): PickHistory {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    playerIds: doc.playerIds.map((id) => id.toString()),
    totalSpent: doc.totalSpent,
    season: doc.season,
    changedAt: doc.changedAt,
    reason: doc.reason,
  };
}

export const PICK_HISTORY_COLLECTION = 'pickHistory';
