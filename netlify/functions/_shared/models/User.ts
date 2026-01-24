// User model (MongoDB)

import { ObjectId } from 'mongodb';
import type { User, UserRole } from '../../../../shared/types';

export interface UserDocument {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export function toUser(doc: UserDocument): User {
  return {
    id: doc._id.toString(),
    firstName: doc.firstName,
    lastName: doc.lastName,
    username: doc.username,
    email: doc.email,
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const USERS_COLLECTION = 'users';
