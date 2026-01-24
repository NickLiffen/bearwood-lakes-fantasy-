// Scores service - enter and retrieve scores

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { ScoreDocument, toScore, SCORES_COLLECTION } from '../models/Score';
import type { WeeklyScore, EnterScoreRequest } from '../../../../shared/types';

export async function getScoresForWeek(week: number): Promise<WeeklyScore[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const scores = await collection.find({ week }).toArray();
  return scores.map(toScore);
}

export async function getScoresForPlayer(playerId: string): Promise<WeeklyScore[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const scores = await collection.find({ playerId: new ObjectId(playerId) }).toArray();
  return scores.map(toScore);
}

export async function enterScore(data: EnterScoreRequest): Promise<WeeklyScore> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const playerObjectId = new ObjectId(data.playerId);
  const now = new Date();

  // Upsert score for player/week combination
  const result = await collection.findOneAndUpdate(
    { playerId: playerObjectId, week: data.week },
    {
      $set: { points: data.points },
      $setOnInsert: {
        playerId: playerObjectId,
        week: data.week,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  return toScore(result!);
}

export async function getAllScores(): Promise<WeeklyScore[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<ScoreDocument>(SCORES_COLLECTION);

  const scores = await collection.find({}).toArray();
  return scores.map(toScore);
}
