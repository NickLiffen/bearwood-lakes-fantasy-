// Player model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Player, Player2025Stats, MembershipType } from '../../../../shared/types';

export interface PlayerDocument {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: MembershipType;
  isActive: boolean;
  stats2025: Player2025Stats;
  createdAt: Date;
  updatedAt: Date;
}

const defaultStats2025: Player2025Stats = {
  timesScored36Plus: 0,
  timesFinished1st: 0,
  timesFinished2nd: 0,
  timesFinished3rd: 0,
  timesPlayed: 0,
};

export function toPlayer(doc: PlayerDocument): Player {
  return {
    id: doc._id.toString(),
    firstName: doc.firstName,
    lastName: doc.lastName,
    picture: doc.picture,
    price: doc.price,
    membershipType: doc.membershipType || 'men',
    isActive: doc.isActive,
    stats2025: doc.stats2025 || defaultStats2025,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export { defaultStats2025 };
export const PLAYERS_COLLECTION = 'players';
