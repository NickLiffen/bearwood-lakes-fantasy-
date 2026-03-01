// Tournaments service - CRUD operations

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { TournamentDocument, toTournament, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import type {
  Tournament,
  TournamentStatus,
  CreateTournamentDTO,
  UpdateTournamentDTO,
} from '../../../../shared/types';
import {
  getMultiplierForType,
  TOURNAMENT_TYPE_CONFIG,
} from '../../../../shared/types/tournament.types';
import { getActiveSeason } from './seasons.service';

async function getCurrentSeason(): Promise<number> {
  const activeSeason = await getActiveSeason();
  if (activeSeason) {
    const parsed = parseInt(activeSeason.name, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return new Date().getFullYear();
}

export async function getAllTournaments(): Promise<Tournament[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const tournaments = await collection.find({}).sort({ startDate: -1 }).toArray();
  return tournaments.map(toTournament);
}

export async function getTournamentsBySeason(season?: number): Promise<Tournament[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const currentSeason = season ?? (await getCurrentSeason());
  const tournaments = await collection
    .find({ season: currentSeason })
    .sort({ startDate: -1 })
    .toArray();
  return tournaments.map(toTournament);
}

export async function getTournamentsByStatus(status: TournamentStatus): Promise<Tournament[]> {
  const { db } = await connectToDatabase();
  const collection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const tournaments = await collection.find({ status }).sort({ startDate: -1 }).toArray();
  return tournaments.map(toTournament);
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const tournament = await collection.findOne({ _id: new ObjectId(id) });
  return tournament ? toTournament(tournament) : null;
}

export async function createTournament(
  data: CreateTournamentDTO,
  season?: number
): Promise<Tournament> {
  const { db } = await connectToDatabase();
  const collection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const currentSeason = season ?? (await getCurrentSeason());
  const now = new Date();

  const tournamentType = data.tournamentType ?? 'rollup_stableford';
  const config = TOURNAMENT_TYPE_CONFIG[tournamentType];
  const multiplier = getMultiplierForType(tournamentType);

  const tournamentData: Omit<TournamentDocument, '_id'> = {
    name: data.name,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    tournamentType,
    scoringFormat: data.scoringFormat ?? config.defaultScoringFormat,
    isMultiDay: data.isMultiDay ?? config.defaultMultiDay,
    multiplier,
    golferCountTier: data.golferCountTier ?? '20+',
    season: data.season ?? currentSeason,
    status: 'draft',
    participatingGolferIds: [],
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(tournamentData as TournamentDocument);

  return {
    id: result.insertedId.toString(),
    ...tournamentData,
    participatingGolferIds: [],
  };
}

export async function updateTournament(
  id: string,
  data: UpdateTournamentDTO
): Promise<Tournament | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
  if (data.tournamentType !== undefined) {
    updateData.tournamentType = data.tournamentType;
    updateData.multiplier = getMultiplierForType(data.tournamentType);
  }
  if (data.golferCountTier !== undefined) updateData.golferCountTier = data.golferCountTier;
  if (data.scoringFormat !== undefined) updateData.scoringFormat = data.scoringFormat;
  if (data.isMultiDay !== undefined) updateData.isMultiDay = data.isMultiDay;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.participatingGolferIds !== undefined) {
    updateData.participatingGolferIds = data.participatingGolferIds.map((id) => new ObjectId(id));
  }

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: updateData },
    { returnDocument: 'after' }
  );

  return result ? toTournament(result) : null;
}

export async function deleteTournament(id: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const collection = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);

  const result = await collection.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}

export async function publishTournament(id: string): Promise<Tournament | null> {
  return updateTournament(id, { status: 'published' });
}

export async function completeTournament(id: string): Promise<Tournament | null> {
  return updateTournament(id, { status: 'complete' });
}
