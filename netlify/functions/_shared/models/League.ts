// League model (MongoDB)

import { ObjectId } from 'mongodb';
import type { League } from '../../../../shared/types';

export interface LeagueDocument {
  _id: ObjectId;
  name: string;
  description: string;
  inviteCode: string;
  adminId: ObjectId;
  memberIds: ObjectId[];
  maxMembers: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toLeague(doc: LeagueDocument): League {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description || '',
    inviteCode: doc.inviteCode,
    adminId: doc.adminId.toString(),
    memberIds: doc.memberIds.map((id) => id.toString()),
    memberCount: doc.memberIds.length,
    maxMembers: doc.maxMembers,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const LEAGUES_COLLECTION = 'leagues';
