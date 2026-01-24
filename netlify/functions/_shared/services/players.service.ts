// Players service - CRUD operations

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { PlayerDocument, toPlayer, PLAYERS_COLLECTION, defaultStats2025 } from '../models/Player';
import type { Player, CreatePlayerDTO, UpdatePlayerDTO } from '../../../../shared/types';

export async function getAllPlayers(): Promise<Player[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);

  const players = await collection.find({}).toArray();
  return players.map(toPlayer);
}

export async function getActivePlayers(): Promise<Player[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);

  const players = await collection.find({ isActive: true }).toArray();
  return players.map(toPlayer);
}

export async function getPlayerById(id: string): Promise<Player | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);

  const player = await collection.findOne({ _id: new ObjectId(id) });
  return player ? toPlayer(player) : null;
}

export async function createPlayer(data: CreatePlayerDTO): Promise<Player> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);

  const now = new Date();
  const playerData: Omit<PlayerDocument, '_id'> = {
    firstName: data.firstName,
    lastName: data.lastName,
    picture: data.picture,
    price: data.price,
    membershipType: data.membershipType,
    isActive: data.isActive ?? true,
    stats2025: data.stats2025 || defaultStats2025,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(playerData as PlayerDocument);

  return {
    id: result.insertedId.toString(),
    ...playerData,
  };
}

export async function updatePlayer(id: string, data: UpdatePlayerDTO): Promise<Player | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  return result ? toPlayer(result) : null;
}

export async function deletePlayer(id: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const collection = db.collection<PlayerDocument>(PLAYERS_COLLECTION);

  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}
