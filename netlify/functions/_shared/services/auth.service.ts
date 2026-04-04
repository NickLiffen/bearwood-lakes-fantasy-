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

/** Machine-readable error codes for refresh failures */
export type RefreshErrorCode =
  | 'NO_REFRESH_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'ROTATION_RACE'
  | 'USER_NOT_FOUND';

export class RefreshError extends Error {
  constructor(
    message: string,
    public readonly code: RefreshErrorCode
  ) {
    super(message);
    this.name = 'RefreshError';
  }
}

// Grace window for rotation race detection (ms)
const ROTATION_GRACE_MS = 2000;

/**
 * Store refresh token in database
 */
async function storeRefreshToken(
  userId: string,
  refreshToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<string> {
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

  return tokenHash;
}

/**
 * Atomically consume a refresh token and return the user.
 * Uses findOneAndUpdate to prevent two concurrent requests from both succeeding.
 * If the token was recently rotated by another tab, throws ROTATION_RACE.
 */
export async function validateRefreshToken(refreshToken: string): Promise<User> {
  const { db } = await connectToDatabase();
  const tokensCollection = db.collection<RefreshTokenDocument>(REFRESH_TOKENS_COLLECTION);
  const usersCollection = db.collection<UserDocument>(USERS_COLLECTION);

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  // Atomically find and revoke the token — only one concurrent request can win
  const result = await tokensCollection.findOneAndUpdate(
    {
      tokenHash,
      expiresAt: { $gt: now },
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: now } },
    { returnDocument: 'before' }
  );

  if (!result) {
    // Token not found as valid — check if it was recently rotated (race condition)
    const revokedToken = await tokensCollection.findOne({ tokenHash });

    if (!revokedToken) {
      throw new RefreshError('Refresh token not found', 'TOKEN_INVALID');
    }

    if (revokedToken.expiresAt <= now) {
      throw new RefreshError('Refresh token expired', 'TOKEN_EXPIRED');
    }

    // Token exists but is revoked — check for rotation race.
    // `replacedByHash` may be written in a separate update after revocation,
    // so treat any very recent revoke as retryable even if lineage is not yet present.
    if (revokedToken.revokedAt) {
      const revokedRecently =
        now.getTime() - revokedToken.revokedAt.getTime() < ROTATION_GRACE_MS;

      if (revokedRecently) {
        throw new RefreshError(
          'Token was just rotated by another session — retry with updated cookie',
          'ROTATION_RACE'
        );
      }
    }

    throw new RefreshError('Refresh token has been revoked', 'TOKEN_INVALID');
  }

  // Get user
  const userDoc = await usersCollection.findOne({ _id: new ObjectId(result.userId) });

  if (!userDoc) {
    throw new RefreshError('User not found', 'USER_NOT_FOUND');
  }

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
 * Refresh the access token using a valid refresh token.
 * Stores rotation lineage (replacedByHash) so concurrent requests can detect races.
 */
export async function refreshAccessToken(
  refreshToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<AuthResponseWithRefresh> {
  // Validate and atomically consume the old refresh token
  const user = await validateRefreshToken(refreshToken);

  // Generate new tokens
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken();

  // Store new refresh token and get its hash
  const newTokenHash = await storeRefreshToken(user.id, newRefreshToken, userAgent, ipAddress);

  // Record rotation lineage on the old token so race detection works
  const { db } = await connectToDatabase();
  const tokensCollection = db.collection<RefreshTokenDocument>(REFRESH_TOKENS_COLLECTION);
  const oldTokenHash = hashRefreshToken(refreshToken);
  await tokensCollection.updateOne({ tokenHash: oldTokenHash }, { $set: { replacedByHash: newTokenHash } });

  return { user, token: newAccessToken, refreshToken: newRefreshToken };
}
