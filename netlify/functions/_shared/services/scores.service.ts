// Scores service - enter and retrieve scores

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { ScoreDocument, toScore, SCORES_COLLECTION } from '../models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import type { Score, EnterScoreRequest, BulkEnterScoresRequest } from '../../../../shared/types';
import { getBasePointsForPosition, getBonusPoints } from '../../../../shared/types/tournament.types';

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

export async function enterScore(data: EnterScoreRequest): Promise<Score> {
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

  const scoringFormat = tournament.scoringFormat || 'stableford';

  // Calculate points - only if participated
  let basePoints = 0;
  let bonusPoints = 0;
  let multipliedPoints = 0;
  
  if (data.participated) {
    basePoints = getBasePointsForPosition(data.position);
    bonusPoints = getBonusPoints(data.rawScore, scoringFormat);
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
        rawScore: data.participated ? data.rawScore : null,
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

  const scoringFormat = tournament.scoringFormat || 'stableford';
  const now = new Date();

  // Build bulk operations for MongoDB bulkWrite
  const operations = data.scores.map(scoreData => {
    const golferObjectId = new ObjectId(scoreData.golferId);
    
    // Calculate points - only if participated
    let basePoints = 0;
    let bonusPoints = 0;
    let multipliedPoints = 0;
    
    if (scoreData.participated) {
      basePoints = getBasePointsForPosition(scoreData.position);
      bonusPoints = getBonusPoints(scoreData.rawScore, scoringFormat);
      multipliedPoints = (basePoints + bonusPoints) * tournament.multiplier;
    }

    return {
      updateOne: {
        filter: { tournamentId: tournamentObjectId, golferId: golferObjectId },
        update: {
          $set: {
            participated: scoreData.participated,
            position: scoreData.participated ? scoreData.position : null,
            rawScore: scoreData.participated ? scoreData.rawScore : null,
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

  const scoringFormat = tournament.scoringFormat || 'stableford';

  // Get all scores for this tournament
  const scores = await scoresCollection.find({ tournamentId: tournamentObjectId }).toArray();
  
  if (scores.length === 0) {
    return 0;
  }

  // Recalculate each score
  let updatedCount = 0;
  for (const score of scores) {
    let basePoints = 0;
    let bonusPoints = 0;
    let multipliedPoints = 0;

    if (score.participated) {
      basePoints = getBasePointsForPosition(score.position);
      bonusPoints = getBonusPoints(score.rawScore, scoringFormat);
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
