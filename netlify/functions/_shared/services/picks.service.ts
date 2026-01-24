// Picks service - manage user team selections

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { PickDocument, toPick, PICKS_COLLECTION } from '../models/Pick';
import { PlayerDocument, PLAYERS_COLLECTION } from '../models/Player';
import { BUDGET_CAP, MAX_PLAYERS } from '../../../../shared/constants/rules';
import type { Pick, PickWithPlayers } from '../../../../shared/types';

export async function getUserPicks(userId: string): Promise<Pick | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PickDocument>(PICKS_COLLECTION);

  const pick = await collection.findOne({ userId: new ObjectId(userId) });
  return pick ? toPick(pick) : null;
}

export async function getUserPicksWithPlayers(userId: string): Promise<PickWithPlayers | null> {
  // connectToDatabase is called by getUserPicks

  // Implementation placeholder - aggregation to join picks with players
  const pick = await getUserPicks(userId);
  if (!pick) return null;

  // Would do aggregation lookup here
  return { ...pick, players: [] } as PickWithPlayers;
}

export async function savePicks(userId: string, playerIds: string[]): Promise<Pick> {
  const { db } = await connectToDatabase();
  const picksCollection = db.collection<PickDocument>(PICKS_COLLECTION);
  const playersCollection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);

  // Validate player count
  if (playerIds.length !== MAX_PLAYERS) {
    throw new Error(`You must select exactly ${MAX_PLAYERS} players`);
  }

  // Check for duplicates
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Duplicate players are not allowed');
  }

  // Get players and calculate total
  const objectIds = playerIds.map((id) => new ObjectId(id));
  const players = await playersCollection.find({ _id: { $in: objectIds } }).toArray();

  if (players.length !== playerIds.length) {
    throw new Error('One or more players not found');
  }

  const totalSpent = players.reduce((sum, p) => sum + p.price, 0);

  if (totalSpent > BUDGET_CAP) {
    throw new Error(`Budget exceeded. Maximum is £${BUDGET_CAP / 1_000_000}m`);
  }

  const now = new Date();
  const userObjectId = new ObjectId(userId);

  // Upsert the pick
  await picksCollection.updateOne(
    { userId: userObjectId },
    {
      $set: {
        playerIds: objectIds,
        totalSpent,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: userObjectId,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const pick = await getUserPicks(userId);
  return pick!;
}
