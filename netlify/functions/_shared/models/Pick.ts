// Pick model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Pick } from '@shared/types';

export interface PickDocument {
  _id: ObjectId;
  userId: ObjectId;
  playerIds: ObjectId[];
  totalSpent: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPick(doc: PickDocument): Pick {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    playerIds: doc.playerIds.map((id) => id.toString()),
    totalSpent: doc.totalSpent,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const PICKS_COLLECTION = 'picks';
