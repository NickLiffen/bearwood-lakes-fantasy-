// Refresh token model for MongoDB

import { ObjectId } from 'mongodb';

export const REFRESH_TOKENS_COLLECTION = 'refreshTokens';

export interface RefreshTokenDocument {
  _id?: ObjectId;
  tokenHash: string; // SHA256 hash of the actual token
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface RefreshToken {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date;
}

export function toRefreshToken(doc: RefreshTokenDocument): RefreshToken {
  return {
    id: doc._id!.toString(),
    tokenHash: doc.tokenHash,
    userId: doc.userId,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    revokedAt: doc.revokedAt,
  };
}
