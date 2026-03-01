// Leagues service — CRUD, membership, and invite code management

import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { LeagueDocument, toLeague, LEAGUES_COLLECTION } from '../models/League';
import { USERS_COLLECTION } from '../models/User';
import type { League, LeagueMemberInfo } from '../../../../shared/types';

const MAX_LEAGUES_PER_USER = 10;
const DEFAULT_MAX_MEMBERS = 50;
const INVITE_CODE_LENGTH = 6;
const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O/1/I confusion

function generateInviteCode(): string {
  const bytes = crypto.randomBytes(INVITE_CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => INVITE_CODE_CHARS[b % INVITE_CODE_CHARS.length])
    .join('');
}

async function ensureUniqueInviteCode(): Promise<string> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);

  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode();
    const existing = await collection.findOne({ inviteCode: code });
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique invite code');
}

export async function createLeague(
  userId: string,
  name: string,
  description: string = ''
): Promise<League> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);
  const userObjectId = new ObjectId(userId);

  // Check user isn't in too many leagues
  const userLeagueCount = await collection.countDocuments({ memberIds: userObjectId });
  if (userLeagueCount >= MAX_LEAGUES_PER_USER) {
    throw new Error(`You can only be in ${MAX_LEAGUES_PER_USER} leagues at a time`);
  }

  const inviteCode = await ensureUniqueInviteCode();
  const now = new Date();

  const doc: Omit<LeagueDocument, '_id'> = {
    name,
    description,
    inviteCode,
    adminId: userObjectId,
    memberIds: [userObjectId],
    maxMembers: DEFAULT_MAX_MEMBERS,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc as LeagueDocument);
  return toLeague({ ...doc, _id: result.insertedId } as LeagueDocument);
}

export async function getLeagueById(leagueId: string): Promise<League | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);
  const doc = await collection.findOne({ _id: new ObjectId(leagueId) });
  return doc ? toLeague(doc) : null;
}

export async function getLeagueByInviteCode(inviteCode: string): Promise<League | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);
  const doc = await collection.findOne({ inviteCode: inviteCode.toUpperCase() });
  return doc ? toLeague(doc) : null;
}

export async function getUserLeagues(userId: string): Promise<League[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);
  const docs = await collection
    .find({ memberIds: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(toLeague);
}

export async function getLeagueMembers(league: League): Promise<LeagueMemberInfo[]> {
  const { db } = await connectToDatabase();
  const userIds = league.memberIds.map((id) => new ObjectId(id));
  const users = await db
    .collection(USERS_COLLECTION)
    .find({ _id: { $in: userIds } })
    .project({ firstName: 1, lastName: 1, username: 1 })
    .toArray();

  return users.map((u) => ({
    userId: u._id.toString(),
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    isAdmin: u._id.toString() === league.adminId,
  }));
}

export async function joinLeague(userId: string, inviteCode: string): Promise<League> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);
  const userObjectId = new ObjectId(userId);

  // Check user isn't in too many leagues
  const userLeagueCount = await collection.countDocuments({ memberIds: userObjectId });
  if (userLeagueCount >= MAX_LEAGUES_PER_USER) {
    throw new Error(`You can only be in ${MAX_LEAGUES_PER_USER} leagues at a time`);
  }

  const league = await collection.findOne({ inviteCode: inviteCode.toUpperCase() });
  if (!league) {
    throw new Error('Invalid invite code');
  }

  // Check not already a member
  if (league.memberIds.some((id) => id.toString() === userId)) {
    throw new Error('You are already a member of this league');
  }

  // Check league isn't full
  if (league.memberIds.length >= league.maxMembers) {
    throw new Error('This league is full');
  }

  const result = await collection.findOneAndUpdate(
    { _id: league._id },
    { $addToSet: { memberIds: userObjectId }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!result) throw new Error('Failed to join league');
  return toLeague(result);
}

export async function leaveLeague(userId: string, leagueId: string): Promise<void> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);

  const league = await collection.findOne({ _id: new ObjectId(leagueId) });
  if (!league) throw new Error('League not found');

  if (league.adminId.toString() === userId) {
    throw new Error('Admin cannot leave the league. Transfer admin first.');
  }

  await collection.updateOne(
    { _id: league._id },
    { $pull: { memberIds: new ObjectId(userId) }, $set: { updatedAt: new Date() } }
  );
}

export async function updateLeague(
  leagueId: string,
  data: { name?: string; description?: string }
): Promise<League | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(leagueId) },
    { $set: updateData },
    { returnDocument: 'after' }
  );

  return result ? toLeague(result) : null;
}

export async function deleteLeague(leagueId: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);
  const result = await collection.deleteOne({ _id: new ObjectId(leagueId) });
  return result.deletedCount === 1;
}

export async function removeMember(leagueId: string, targetUserId: string): Promise<void> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);

  const league = await collection.findOne({ _id: new ObjectId(leagueId) });
  if (!league) throw new Error('League not found');

  if (league.adminId.toString() === targetUserId) {
    throw new Error('Cannot remove the league admin');
  }

  if (!league.memberIds.some((id) => id.toString() === targetUserId)) {
    throw new Error('User is not a member of this league');
  }

  await collection.updateOne(
    { _id: league._id },
    { $pull: { memberIds: new ObjectId(targetUserId) }, $set: { updatedAt: new Date() } }
  );
}

export async function transferAdmin(
  leagueId: string,
  newAdminId: string
): Promise<League | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);

  const league = await collection.findOne({ _id: new ObjectId(leagueId) });
  if (!league) throw new Error('League not found');

  if (!league.memberIds.some((id) => id.toString() === newAdminId)) {
    throw new Error('New admin must be a current member');
  }

  const result = await collection.findOneAndUpdate(
    { _id: league._id },
    { $set: { adminId: new ObjectId(newAdminId), updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  return result ? toLeague(result) : null;
}

export async function regenerateInviteCode(leagueId: string): Promise<League | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<LeagueDocument>(LEAGUES_COLLECTION);

  const newCode = await ensureUniqueInviteCode();

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(leagueId) },
    { $set: { inviteCode: newCode, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  return result ? toLeague(result) : null;
}
