// Auth service - registration, login logic

import { connectToDatabase } from '../db';
import { hashPassword, comparePassword, generateToken } from '../auth';
import { UserDocument, toUser, USERS_COLLECTION } from '../models/User';
import type { User, AuthResponse, CreateUserDTO, LoginCredentials } from '../../../../shared/types';

export async function registerUser(data: CreateUserDTO): Promise<AuthResponse> {
  const { db } = await connectToDatabase();
  const collection = db.collection<UserDocument>(USERS_COLLECTION);

  // Check for existing email/username
  const existing = await collection.findOne({
    $or: [{ email: data.email }, { username: data.username }],
  });

  if (existing) {
    throw new Error(
      existing.email === data.email ? 'Email already exists' : 'Username already exists'
    );
  }

  const passwordHash = await hashPassword(data.password);
  const now = new Date();

  const result = await collection.insertOne({
    firstName: data.firstName,
    lastName: data.lastName,
    username: data.username,
    email: data.email,
    passwordHash,
    role: 'user',
    createdAt: now,
    updatedAt: now,
  } as UserDocument);

  const user: User = {
    id: result.insertedId.toString(),
    firstName: data.firstName,
    lastName: data.lastName,
    username: data.username,
    email: data.email,
    role: 'user',
    createdAt: now,
    updatedAt: now,
  };

  const token = generateToken(user);

  return { user, token };
}

export async function loginUser(credentials: LoginCredentials): Promise<AuthResponse> {
  const { db } = await connectToDatabase();
  const collection = db.collection<UserDocument>(USERS_COLLECTION);

  const userDoc = await collection.findOne({ username: credentials.username });

  if (!userDoc) {
    throw new Error('Invalid username or password');
  }

  const isValid = await comparePassword(credentials.password, userDoc.passwordHash);

  if (!isValid) {
    throw new Error('Invalid username or password');
  }

  const user = toUser(userDoc);
  const token = generateToken(user);

  return { user, token };
}
