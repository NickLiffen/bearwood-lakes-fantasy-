// Season model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Season, SeasonStatus } from '../../../../shared/types';

export interface SeasonDocument {
  _id: ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  status: SeasonStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function toSeason(doc: SeasonDocument): Season {
  return {
    id: doc._id.toString(),
    name: doc.name,
    startDate: doc.startDate,
    endDate: doc.endDate,
    isActive: doc.isActive ?? false,
    status: doc.status || 'setup',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const SEASONS_COLLECTION = 'seasons';
