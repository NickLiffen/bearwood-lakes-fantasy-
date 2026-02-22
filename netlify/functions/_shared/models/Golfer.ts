// Golfer model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Golfer, Golfer2024Stats, Golfer2025Stats, Golfer2026Stats, MembershipType } from '../../../../shared/types';

export interface GolferDocument {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: MembershipType;
  isActive: boolean;
  stats2024: Golfer2024Stats;
  stats2025: Golfer2025Stats;
  stats2026: Golfer2026Stats;
  createdAt: Date;
  updatedAt: Date;
}

const defaultStats2024: Golfer2024Stats = {
  timesScored36Plus: 0,
  timesFinished1st: 0,
  timesFinished2nd: 0,
  timesFinished3rd: 0,
  timesPlayed: 0,
};

const defaultStats2025: Golfer2025Stats = {
  timesScored36Plus: 0,
  timesFinished1st: 0,
  timesFinished2nd: 0,
  timesFinished3rd: 0,
  timesPlayed: 0,
};

const defaultStats2026: Golfer2026Stats = {
  timesScored36Plus: 0,
  timesFinished1st: 0,
  timesFinished2nd: 0,
  timesFinished3rd: 0,
  timesPlayed: 0,
};

export function toGolfer(doc: GolferDocument): Golfer {
  return {
    id: doc._id.toString(),
    firstName: doc.firstName,
    lastName: doc.lastName,
    picture: doc.picture,
    price: doc.price,
    membershipType: doc.membershipType || 'men',
    isActive: doc.isActive,
    stats2024: doc.stats2024 || defaultStats2024,
    stats2025: doc.stats2025 || defaultStats2025,
    stats2026: doc.stats2026 || defaultStats2026,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export { defaultStats2024, defaultStats2025, defaultStats2026 };
export const GOLFERS_COLLECTION = 'golfers';
