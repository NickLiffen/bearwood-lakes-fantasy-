// Tournament model (MongoDB)

import { ObjectId } from 'mongodb';
import type { Tournament, TournamentStatus, TournamentType, PlayerCountTier } from '../../../../shared/types';

export interface TournamentDocument {
  _id: ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  tournamentType: TournamentType;
  multiplier: number;
  playerCountTier: PlayerCountTier;
  season: number;
  status: TournamentStatus;
  participatingPlayerIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export function toTournament(doc: TournamentDocument): Tournament {
  return {
    id: doc._id.toString(),
    name: doc.name,
    startDate: doc.startDate,
    endDate: doc.endDate,
    tournamentType: doc.tournamentType || 'regular',
    multiplier: doc.multiplier,
    playerCountTier: doc.playerCountTier || '20+',
    season: doc.season,
    status: doc.status,
    participatingPlayerIds: doc.participatingPlayerIds.map((id) => id.toString()),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const TOURNAMENTS_COLLECTION = 'tournaments';
