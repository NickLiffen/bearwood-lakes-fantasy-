// Users service - list, get users

import { connectToDatabase } from '../db';
import { UserDocument, toUser, USERS_COLLECTION } from '../models/User';
import type { User } from '@shared/types';

export async function getAllUsers(): Promise<User[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<UserDocument>(USERS_COLLECTION);

  const users = await collection.find({}).toArray();
  return users.map(toUser);
}

export async function getUserById(id: string): Promise<User | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<UserDocument>(USERS_COLLECTION);
  const { ObjectId } = await import('mongodb');

  const user = await collection.findOne({ _id: new ObjectId(id) });
  return user ? toUser(user) : null;
}
