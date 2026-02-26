// Golfers service - CRUD operations

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { GolferDocument, toGolfer, GOLFERS_COLLECTION, defaultStats2025 } from '../models/Golfer';
import { ScoreDocument, SCORES_COLLECTION } from '../models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
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

export async function calculateGolferPrices(season: number): Promise<{
  updated: number;
  minPrice: number;
  maxPrice: number;
  summary: string;
}> {
  const { db } = await connectToDatabase();

  // 1. Get all season tournaments
  const tournaments = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .find({ season })
    .toArray();
  const tournamentIds = tournaments.map((t) => t._id);

  // 2. Get all scores for those tournaments
  const scores = await db
    .collection<ScoreDocument>(SCORES_COLLECTION)
    .find({ tournamentId: { $in: tournamentIds }, participated: true })
    .toArray();

  // 3. Aggregate per golfer
  const golferStats = new Map<string, { totalFantasyPoints: number; timesPlayed: number }>();
  for (const score of scores) {
    const golferId = score.golferId.toString();
    const existing = golferStats.get(golferId) || { totalFantasyPoints: 0, timesPlayed: 0 };
    existing.totalFantasyPoints += score.multipliedPoints;
    existing.timesPlayed += 1;
    golferStats.set(golferId, existing);
  }

  // 4. Get all golfers
  const golfers = await db.collection<GolferDocument>(GOLFERS_COLLECTION).find({}).toArray();

  // 5. Calculate prices
  let maxAdjustedPoints = 0;
  const adjustedPointsMap = new Map<string, number>();

  for (const golfer of golfers) {
    const golferId = golfer._id.toString();
    const stats = golferStats.get(golferId);
    if (stats) {
      const adjustedPoints = stats.totalFantasyPoints + stats.timesPlayed * 0.5;
      adjustedPointsMap.set(golferId, adjustedPoints);
      if (adjustedPoints > maxAdjustedPoints) {
        maxAdjustedPoints = adjustedPoints;
      }
    }
  }

  if (maxAdjustedPoints === 0) {
    maxAdjustedPoints = 1;
  }

  const bulkOps = golfers.map((golfer) => {
    const golferId = golfer._id.toString();
    const adjustedPoints = adjustedPointsMap.get(golferId);
    const normalized = adjustedPoints !== undefined ? adjustedPoints / maxAdjustedPoints : 0;
    let price = 3_000_000 + normalized * 12_000_000;
    price = Math.round(price / 500_000) * 500_000;
    price = Math.max(price, 3_000_000);

    return {
      updateOne: {
        filter: { _id: golfer._id },
        update: { $set: { price, updatedAt: new Date() } },
      },
    };
  });

  // 6. Bulk update
  if (bulkOps.length === 0) {
    return { updated: 0, minPrice: 0, maxPrice: 0, summary: 'No golfers to update.' };
  }

  const bulkResult = await db.collection<GolferDocument>(GOLFERS_COLLECTION).bulkWrite(bulkOps);

  // 7. Return summary
  const prices = bulkOps.map((op) => op.updateOne.update.$set.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  return {
    updated: bulkResult.modifiedCount,
    minPrice,
    maxPrice,
    summary: `Updated ${bulkResult.modifiedCount} golfer prices for season ${season}. Range: $${(minPrice / 1_000_000).toFixed(1)}M - $${(maxPrice / 1_000_000).toFixed(1)}M based on ${scores.length} scores across ${tournaments.length} tournaments.`,
  };
}
