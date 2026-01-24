// Score model (MongoDB)

import { ObjectId } from 'mongodb';
import type { WeeklyScore } from '@shared/types';

export interface ScoreDocument {
  _id: ObjectId;
  playerId: ObjectId;
  week: number;
  points: number;
  createdAt: Date;
}

export function toScore(doc: ScoreDocument): WeeklyScore {
  return {
    id: doc._id.toString(),
    playerId: doc.playerId.toString(),
    week: doc.week,
    points: doc.points,
    createdAt: doc.createdAt,
  };
}

export const SCORES_COLLECTION = 'scores';
