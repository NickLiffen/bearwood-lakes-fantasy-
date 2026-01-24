// Player model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Player } from '@shared/types';

export interface PlayerDocument {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPlayer(doc: PlayerDocument): Player {
  return {
    id: doc._id.toString(),
    firstName: doc.firstName,
    lastName: doc.lastName,
    picture: doc.picture,
    price: doc.price,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const PLAYERS_COLLECTION = 'players';
