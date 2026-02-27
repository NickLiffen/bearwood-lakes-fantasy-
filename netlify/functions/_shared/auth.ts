// Auth utilities - JWT and password helpers

import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { User } from '../../../shared/types';

/**
 * Get a required environment variable or throw a descriptive error
 */
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Please ensure it is set in your Netlify environment variables or .env.local file.`
    );
  }
  return value;
}

// Access token: short-lived (15 minutes)
const ACCESS_TOKEN_EXPIRES = '15m';
// Refresh token: long-lived (30 days)
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  phoneVerified: boolean;
}

export interface RefreshTokenData {
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate short-lived access token (JWT)
 */
export function generateAccessToken(user: User): string {
  const jwtSecret = getRequiredEnv('JWT_SECRET');
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    phoneVerified: user.phoneVerified ?? false,
  };
  const options: SignOptions = { expiresIn: ACCESS_TOKEN_EXPIRES };
  return jwt.sign(payload, jwtSecret, options);
}

/**
 * Generate long-lived refresh token (opaque token stored in DB)
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Get refresh token expiry date
 */
export function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);
  return expiry;
}

/**
 * Verify access token
 */
export function verifyToken(token: string): JwtPayload {
  const jwtSecret = getRequiredEnv('JWT_SECRET');
  return jwt.verify(token, jwtSecret) as JwtPayload;
}

/**
 * Hash refresh token for secure storage
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Legacy export for backward compatibility
export const generateToken = generateAccessToken;
