// Scores service - enter and retrieve scores

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { ScoreDocument, toScore, SCORES_COLLECTION } from '../models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import type { Score, EnterScoreRequest, BulkEnterScoresRequest } from '../../../../shared/types';
import type { GolferCountTier } from '../../../../shared/types/tournament.types';
import { getBasePointsForPosition } from '../../../../shared/types/tournament.types';

// Helper to determine tier from participant count
function getTierFromCount(count: number): GolferCountTier {
  if (count <= 10) return '0-10';
  if (count < 20) return '10-20';
  return '20+';
}

export async function getScoresForTournament(tournamentId: string): Promise<Score[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const scores = await collection
    .find({ tournamentId: new ObjectId(tournamentId) })
    .toArray();
  return scores.map(toScore);
}

export async function getScoresForGolfer(golferId: string): Promise<Score[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const scores = await collection
    .find({ golferId: new ObjectId(golferId) })
    .toArray();
  return scores.map(toScore);
}

export async function enterScore(data: EnterScoreRequest, golferCountTier?: GolferCountTier): Promise<Score> {
  const { db } = await connectToDatabase();
  const scoresCollection = db.collection<ScoreDocument>(SCORES_COLLECTION);
  const tournamentsCollection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const tournamentObjectId = new ObjectId(data.tournamentId);
  const golferObjectId = new ObjectId(data.golferId);

  // Get tournament to calculate points
  const tournament = await tournamentsCollection.findOne({ _id: tournamentObjectId });
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // Use provided tier or default to 20+
  const tier = golferCountTier || '20+';
  
  // Calculate points - only if participated
  let basePoints = 0;
  let bonusPoints = 0;
  let multipliedPoints = 0;
  
  if (data.participated) {
    basePoints = getBasePointsForPosition(data.position, tier);
    bonusPoints = data.scored36Plus ? 1 : 0;
    multipliedPoints = (basePoints + bonusPoints) * tournament.multiplier;
  }
  
  const now = new Date();

  // Upsert score for golfer/tournament combination
  const result = await scoresCollection.findOneAndUpdate(
    { tournamentId: tournamentObjectId, golferId: golferObjectId },
    {
      $set: {
        participated: data.participated,
        position: data.participated ? data.position : null,
        scored36Plus: data.participated ? data.scored36Plus : false,
        basePoints,
        bonusPoints,
        multipliedPoints,
        updatedAt: now,
      },
      $setOnInsert: {
        tournamentId: tournamentObjectId,
        golferId: golferObjectId,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  return toScore(result!);
}

export async function bulkEnterScores(data: BulkEnterScoresRequest): Promise<Score[]> {
  const { db } = await connectToDatabase();
  const scoresCollection = db.collection<ScoreDocument>(SCORES_COLLECTION);
  const tournamentsCollection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  // Get tournament once (not N times in a loop!)
  const tournamentObjectId = new ObjectId(data.tournamentId);
  const tournament = await tournamentsCollection.findOne({ _id: tournamentObjectId });
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // Determine tier from participant count
  const participantCount = data.scores.filter(s => s.participated).length;
  const tier = getTierFromCount(participantCount);
  
  const now = new Date();

  // Build bulk operations for MongoDB bulkWrite
  const operations = data.scores.map(scoreData => {
    const golferObjectId = new ObjectId(scoreData.golferId);
    
    // Calculate points - only if participated
    let basePoints = 0;
    let bonusPoints = 0;
    let multipliedPoints = 0;
    
    if (scoreData.participated) {
      basePoints = getBasePointsForPosition(scoreData.position, tier);
      bonusPoints = scoreData.scored36Plus ? 1 : 0;
      multipliedPoints = (basePoints + bonusPoints) * tournament.multiplier;
    }

    return {
      updateOne: {
        filter: { tournamentId: tournamentObjectId, golferId: golferObjectId },
        update: {
          $set: {
            participated: scoreData.participated,
            position: scoreData.participated ? scoreData.position : null,
            scored36Plus: scoreData.participated ? scoreData.scored36Plus : false,
            basePoints,
            bonusPoints,
            multipliedPoints,
            updatedAt: now,
          },
          $setOnInsert: {
            tournamentId: tournamentObjectId,
            golferId: golferObjectId,
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  // Execute all upserts in a single bulk operation (50 scores = 1 DB call instead of 150+)
  await scoresCollection.bulkWrite(operations);

  // Fetch the updated scores to return
  const golferIds = data.scores.map(s => new ObjectId(s.golferId));
  const updatedScores = await scoresCollection
    .find({ tournamentId: tournamentObjectId, golferId: { $in: golferIds } })
    .toArray();

  return updatedScores.map(toScore);
}

export async function getAllScores(): Promise<Score[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const scores = await collection.find({}).toArray();
  return scores.map(toScore);
}

export async function getPublishedScores(): Promise<Score[]> {
  const { db } = await connectToDatabase();
  const scoresCollection = db.collection<ScoreDocument>(SCORES_COLLECTION);
  const tournamentsCollection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  // Get published tournaments
  const publishedTournaments = await tournamentsCollection
    .find({ status: 'published' })
    .toArray();
  const publishedIds = publishedTournaments.map((t) => t._id);

  // Get scores only from published tournaments
  const scores = await scoresCollection
    .find({ tournamentId: { $in: publishedIds } })
    .toArray();

  return scores.map(toScore);
}

export async function deleteScore(scoreId: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const result = await collection.deleteOne({ _id: new ObjectId(scoreId) });
  return result.deletedCount === 1;
}

export async function deleteScoresForTournament(tournamentId: string): Promise<number> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const result = await collection.deleteMany({ tournamentId: new ObjectId(tournamentId) });
  return result.deletedCount;
}

export async function deleteScoresForGolfer(golferId: string): Promise<number> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const result = await collection.deleteMany({ golferId: new ObjectId(golferId) });
  return result.deletedCount;
}

export async function recalculateScoresForTournament(tournamentId: string): Promise<number> {
  const { db } = await connectToDatabase();
  const scoresCollection = db.collection<ScoreDocument>(SCORES_COLLECTION);
  const tournamentsCollection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const tournamentObjectId = new ObjectId(tournamentId);

  // Get the tournament
  const tournament = await tournamentsCollection.findOne({ _id: tournamentObjectId });
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // Get all scores for this tournament
  const scores = await scoresCollection.find({ tournamentId: tournamentObjectId }).toArray();
  
  if (scores.length === 0) {
    return 0;
  }

  // Determine tier based on participant count
  const participantCount = scores.filter(s => s.participated).length;
  const tier = getTierFromCount(participantCount);

  // Recalculate each score
  let updatedCount = 0;
  for (const score of scores) {
    let basePoints = 0;
    let bonusPoints = 0;
    let multipliedPoints = 0;

    if (score.participated) {
      basePoints = getBasePointsForPosition(score.position, tier);
      bonusPoints = score.scored36Plus ? 1 : 0;
      multipliedPoints = (basePoints + bonusPoints) * tournament.multiplier;
    }

    await scoresCollection.updateOne(
      { _id: score._id },
      {
        $set: {
          basePoints,
          bonusPoints,
          multipliedPoints,
          updatedAt: new Date(),
        },
      }
    );
    updatedCount++;
  }

  return updatedCount;
}
