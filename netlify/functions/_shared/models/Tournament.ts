// Tournament model (MongoDB)

import { ObjectId } from 'mongodb';
import type {
  Tournament,
  TournamentStatus,
  TournamentType,
  ScoringFormat,
  GolferCountTier,
} from '../../../../shared/types';

export interface TournamentDocument {
  _id: ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  tournamentType: TournamentType;
  scoringFormat: ScoringFormat;
  isMultiDay: boolean;
  multiplier: number;
  golferCountTier: GolferCountTier;
  season: number;
  status: TournamentStatus;
  participatingGolferIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export function toTournament(doc: TournamentDocument): Tournament {
  return {
    id: doc._id.toString(),
    name: doc.name,
    startDate: doc.startDate,
    endDate: doc.endDate,
    tournamentType: doc.tournamentType || 'rollup_stableford',
    scoringFormat: doc.scoringFormat || 'stableford',
    isMultiDay: doc.isMultiDay ?? false,
    multiplier: doc.multiplier,
    golferCountTier: doc.golferCountTier || '20+',
    season: doc.season,
    status: doc.status,
    participatingGolferIds: (doc.participatingGolferIds || []).map((id) => id.toString()),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const TOURNAMENTS_COLLECTION = 'tournaments';
