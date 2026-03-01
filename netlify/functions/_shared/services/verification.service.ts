// Verification service — send and check phone verification codes

import { connectToDatabase } from '../db';
import { UserDocument, toUser, USERS_COLLECTION } from '../models/User';
import { sendVerificationCode, checkVerificationCode } from '../twilio';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
} from '../auth';
import { RefreshTokenDocument, REFRESH_TOKENS_COLLECTION } from '../models/RefreshToken';
import type { User } from '../../../../shared/types';
import { ObjectId } from 'mongodb';

/**
 * Send a phone verification OTP to the user's stored phone number.
 */
export async function sendPhoneVerification(userId: string): Promise<void> {
  const { db } = await connectToDatabase();
  const usersCollection = db.collection<UserDocument>(USERS_COLLECTION);

  const userDoc = await usersCollection.findOne({ _id: new ObjectId(userId) });
  if (!userDoc) {
    throw new Error('User not found');
  }

  if (!userDoc.phoneNumber) {
    throw new Error('User does not have a phone number');
  }

  if (userDoc.phoneVerified) {
    throw new Error('Phone number is already verified');
  }

  await sendVerificationCode(userDoc.phoneNumber);
}

/**
 * Check the OTP code and mark the user's phone as verified.
 * Returns the updated user with new auth tokens.
 */
export async function checkPhoneVerification(
  userId: string,
  code: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ user: User; token: string; refreshToken: string }> {
  const { db } = await connectToDatabase();
  const usersCollection = db.collection<UserDocument>(USERS_COLLECTION);

  const userDoc = await usersCollection.findOne({ _id: new ObjectId(userId) });
  if (!userDoc) {
    throw new Error('User not found');
  }

  if (!userDoc.phoneNumber) {
    throw new Error('User does not have a phone number');
  }

  if (userDoc.phoneVerified) {
    throw new Error('Phone number is already verified');
  }

  const isValid = await checkVerificationCode(userDoc.phoneNumber, code);
  if (!isValid) {
    throw new Error('Invalid or expired verification code');
  }

  // Mark phone as verified
  await usersCollection.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { phoneVerified: true, updatedAt: new Date() } }
  );

  // Re-fetch and convert to User
  const updatedDoc = await usersCollection.findOne({ _id: new ObjectId(userId) });
  if (!updatedDoc) {
    throw new Error('User not found after update');
  }

  const user = toUser(updatedDoc);

  // Issue new tokens with phoneVerified: true
  const token = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  // Store the new refresh token
  const tokensCollection = db.collection<RefreshTokenDocument>(REFRESH_TOKENS_COLLECTION);
  const tokenHash = hashRefreshToken(refreshToken);
  await tokensCollection.insertOne({
    tokenHash,
    userId,
    expiresAt: getRefreshTokenExpiry(),
    createdAt: new Date(),
    userAgent,
    ipAddress,
  });

  return { user, token, refreshToken };
}
