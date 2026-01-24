// Score model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Score } from '../../../../shared/types';

export interface ScoreDocument {
  _id: ObjectId;
  tournamentId: ObjectId;
  playerId: ObjectId;
  participated: boolean;
  position: number | null;
  scored36Plus: boolean;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toScore(doc: ScoreDocument): Score {
  return {
    id: doc._id.toString(),
    tournamentId: doc.tournamentId.toString(),
    playerId: doc.playerId.toString(),
    participated: doc.participated ?? true,
    position: doc.position,
    scored36Plus: doc.scored36Plus ?? false,
    basePoints: doc.basePoints ?? 0,
    bonusPoints: doc.bonusPoints ?? 0,
    multipliedPoints: doc.multipliedPoints,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const SCORES_COLLECTION = 'scores';
