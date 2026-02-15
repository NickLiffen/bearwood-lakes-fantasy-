// Seasons service - CRUD operations

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { getRedisClient } from '../rateLimit';
import { SeasonDocument, toSeason, SEASONS_COLLECTION } from '../models/Season';
import type { Season, CreateSeasonDTO, UpdateSeasonDTO } from '../../../../shared/types';

const ACTIVE_SEASON_CACHE_KEY = 'v1:cache:active-season';
const ACTIVE_SEASON_TTL = 60; // seconds

async function invalidateActiveSeasonCache(): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(ACTIVE_SEASON_CACHE_KEY);
  } catch {
    // Redis unavailable — cache will expire naturally via TTL
  }
}

export async function getAllSeasons(): Promise<Season[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  const seasons = await collection.find({}).sort({ startDate: -1 }).toArray();
  return seasons.map(toSeason);
}

export async function getActiveSeason(): Promise<Season | null> {
  // Try Redis cache first
  try {
    const redis = getRedisClient();
    const cached = await redis.get(ACTIVE_SEASON_CACHE_KEY);
    if (cached) {
      // Upstash auto-deserializes JSON, so cached may already be an object
      return (typeof cached === 'object' ? cached : JSON.parse(cached as string)) as Season;
    }
  } catch {
    // Redis unavailable — fall through to MongoDB
  }

  // Cache miss — query MongoDB
  const { db } = await connectToDatabase();
  const collection = db.collection<SeasonDocument>(SEASONS_COLLECTION);
  const doc = await collection.findOne({ isActive: true });

  if (!doc) return null;

  const season = toSeason(doc);

  // Write to cache (fire and forget)
  try {
    const redis = getRedisClient();
    await redis.set(ACTIVE_SEASON_CACHE_KEY, JSON.stringify(season), { ex: ACTIVE_SEASON_TTL });
  } catch {
    // Redis unavailable — continue without caching
  }

  return season;
}

export async function getSeasonByName(name: string): Promise<Season | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  const season = await collection.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  return season ? toSeason(season) : null;
}

export async function getSeasonById(id: string): Promise<Season | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  const season = await collection.findOne({ _id: new ObjectId(id) });
  return season ? toSeason(season) : null;
}

export async function createSeason(data: CreateSeasonDTO): Promise<Season> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  const now = new Date();
  const isActive = data.isActive ?? false;

  if (isActive) {
    await collection.updateMany({}, { $set: { isActive: false } });
  }

  const seasonData: Omit<SeasonDocument, '_id'> = {
    name: data.name,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    isActive,
    status: data.status ?? 'setup',
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(seasonData as SeasonDocument);

  if (isActive) {
    await invalidateActiveSeasonCache();
  }

  return {
    id: result.insertedId.toString(),
    ...seasonData,
  };
}

export async function updateSeason(id: string, data: UpdateSeasonDTO): Promise<Season | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  if (data.isActive === true) {
    await collection.updateMany({}, { $set: { isActive: false } });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.status !== undefined) updateData.status = data.status;

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: 'after' }
  );

  await invalidateActiveSeasonCache();

  return result ? toSeason(result) : null;
}

export async function setActiveSeason(id: string): Promise<Season | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  // Verify the target season exists before deactivating all seasons
  const target = await collection.findOne({ _id: new ObjectId(id) });
  if (!target) {
    return null;
  }

  await collection.updateMany({}, { $set: { isActive: false } });

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { isActive: true, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  await invalidateActiveSeasonCache();

  return result ? toSeason(result) : null;
}

export async function deleteSeason(id: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  const season = await collection.findOne({ _id: new ObjectId(id) });
  if (season?.isActive) {
    throw new Error('Cannot delete the active season');
  }

  const result = await collection.deleteOne({ _id: new ObjectId(id) });

  await invalidateActiveSeasonCache();

  return result.deletedCount === 1;
}
