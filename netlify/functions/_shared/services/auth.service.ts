// Auth service - registration, login logic

import { connectToDatabase } from '../db';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  hashRefreshToken,
} from '../auth';
import { UserDocument, toUser, USERS_COLLECTION } from '../models/User';
import { RefreshTokenDocument, REFRESH_TOKENS_COLLECTION } from '../models/RefreshToken';
import type { User, AuthResponse, CreateUserDTO, LoginCredentials } from '../../../../shared/types';
import { ObjectId } from 'mongodb';

export interface AuthResponseWithRefresh extends AuthResponse {
  refreshToken: string;
}

/**
 * Store refresh token in database
 */
async function storeRefreshToken(
  userId: string,
  refreshToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<void> {
  const { db } = await connectToDatabase();
  const collection = db.collection<RefreshTokenDocument>(REFRESH_TOKENS_COLLECTION);

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  await collection.insertOne({
    tokenHash,
    userId,
    expiresAt: getRefreshTokenExpiry(),
    createdAt: now,
    userAgent,
    ipAddress,
  });
}

/**
 * Validate and consume a refresh token
 * Returns the user if valid, throws if invalid
 */
export async function validateRefreshToken(refreshToken: string): Promise<User> {
  const { db } = await connectToDatabase();
  const tokensCollection = db.collection<RefreshTokenDocument>(REFRESH_TOKENS_COLLECTION);
  const usersCollection = db.collection<UserDocument>(USERS_COLLECTION);

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  // Find valid token (not expired, not revoked)
  const tokenDoc = await tokensCollection.findOne({
    tokenHash,
    expiresAt: { $gt: now },
    revokedAt: { $exists: false },
  });

  if (!tokenDoc) {
    throw new Error('Invalid or expired refresh token');
  }

  // Get user
  const userDoc = await usersCollection.findOne({ _id: new ObjectId(tokenDoc.userId) });

  if (!userDoc) {
    throw new Error('User not found');
  }

  // Revoke the used token (rotation)
  await tokensCollection.updateOne({ _id: tokenDoc._id }, { $set: { revokedAt: now } });

  return toUser(userDoc);
}

/**
 * Revoke all refresh tokens for a user (logout from all devices)
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const { db } = await connectToDatabase();
  const collection = db.collection<RefreshTokenDocument>(REFRESH_TOKENS_COLLECTION);

  await collection.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
}

/**
 * Revoke a specific refresh token
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const { db } = await connectToDatabase();
  const collection = db.collection<RefreshTokenDocument>(REFRESH_TOKENS_COLLECTION);

  const tokenHash = hashRefreshToken(refreshToken);
  await collection.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
}

export async function registerUser(
  data: CreateUserDTO,
  userAgent?: string,
  ipAddress?: string
): Promise<AuthResponseWithRefresh> {
  const { db } = await connectToDatabase();
  const collection = db.collection<UserDocument>(USERS_COLLECTION);

  // Check for existing email/username/phone
  const existing = await collection.findOne({
    $or: [{ email: data.email }, { username: data.username }, { phoneNumber: data.phoneNumber }],
  });

  if (existing) {
    if (existing.email === data.email) throw new Error('Email already exists');
    if (existing.username === data.username) throw new Error('Username already exists');
    throw new Error('Phone number already exists');
  }

  const passwordHash = await hashPassword(data.password);
  const now = new Date();

  let result;
  try {
    result = await collection.insertOne({
      firstName: data.firstName,
      lastName: data.lastName,
      username: data.username,
      email: data.email,
      passwordHash,
      phoneNumber: data.phoneNumber,
      phoneVerified: false,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    } as UserDocument);
  } catch (err: unknown) {
    // Handle duplicate key errors from unique indexes (race condition safety net)
    if (err instanceof Error && 'code' in err && (err as { code: number }).code === 11000) {
      const message = err.message;
      if (message.includes('phoneNumber')) throw new Error('Phone number already exists');
      if (message.includes('email')) throw new Error('Email already exists');
      if (message.includes('username')) throw new Error('Username already exists');
    }
    throw err;
  }

  const user: User = {
    id: result.insertedId.toString(),
    firstName: data.firstName,
    lastName: data.lastName,
    username: data.username,
    email: data.email,
    phoneNumber: data.phoneNumber,
    phoneVerified: false,
    role: 'user',
    createdAt: now,
    updatedAt: now,
  };

  const token = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  // Store refresh token
  await storeRefreshToken(user.id, refreshToken, userAgent, ipAddress);

  return { user, token, refreshToken };
}

export async function loginUser(
  credentials: LoginCredentials,
  userAgent?: string,
  ipAddress?: string
): Promise<AuthResponseWithRefresh> {
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
  const token = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  // Store refresh token
  await storeRefreshToken(user.id, refreshToken, userAgent, ipAddress);

  return { user, token, refreshToken };
}

/**
 * Refresh the access token using a valid refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<AuthResponseWithRefresh> {
  // Validate and consume the old refresh token
  const user = await validateRefreshToken(refreshToken);

  // Generate new tokens
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken();

  // Store new refresh token
  await storeRefreshToken(user.id, newRefreshToken, userAgent, ipAddress);

  return { user, token: newAccessToken, refreshToken: newRefreshToken };
}
