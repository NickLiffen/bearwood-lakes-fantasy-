// Golfers service - CRUD operations

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { GolferDocument, toGolfer, GOLFERS_COLLECTION, defaultStats2025 } from '../models/Golfer';
import type { Golfer, CreateGolferDTO, UpdateGolferDTO } from '../../../../shared/types';

export async function getAllGolfers(): Promise<Golfer[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

  const golfers = await collection.find({}).toArray();
  return golfers.map(toGolfer);
}

export async function getActiveGolfers(): Promise<Golfer[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

  const golfers = await collection.find({ isActive: true }).toArray();
  return golfers.map(toGolfer);
}

export async function getGolferById(id: string): Promise<Golfer | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

  const golfer = await collection.findOne({ _id: new ObjectId(id) });
  return golfer ? toGolfer(golfer) : null;
}

export async function createGolfer(data: CreateGolferDTO): Promise<Golfer> {
  const { db } = await connectToDatabase();
  const collection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

  const now = new Date();
  const golferData: Omit<GolferDocument, '_id'> = {
    firstName: data.firstName,
    lastName: data.lastName,
    picture: data.picture,
    price: data.price,
    membershipType: data.membershipType,
    isActive: data.isActive ?? true,
    stats2025: data.stats2025 || defaultStats2025,
    stats2026: data.stats2026 || defaultStats2025,
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(golferData as GolferDocument);

  return {
    id: result.insertedId.toString(),
    ...golferData,
  };
}

export async function updateGolfer(id: string, data: UpdateGolferDTO): Promise<Golfer | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  return result ? toGolfer(result) : null;
}

export async function deleteGolfer(id: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const collection = db.collection<GolferDocument>(GOLFERS_COLLECTION);

  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}
