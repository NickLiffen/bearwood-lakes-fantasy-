// Tournament Upload Service — processes PDF-parsed tournament data
// Creates/updates tournament, matches/creates golfers, enters scores, recalculates stats.
// Uses the shared batched upload-core so large fields (e.g. a 400-golfer club champs) complete
// in a bounded number of DB round-trips instead of ~5-6 per golfer.

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { GolferDocument, GOLFERS_COLLECTION } from '../models/Golfer';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import { ScoreDocument, SCORES_COLLECTION } from '../models/Score';
import { SeasonDocument, SEASONS_COLLECTION } from '../models/Season';
import {
  TOURNAMENT_TYPE_CONFIG,
  type TournamentType,
  type ScoringFormat,
} from '../../../../shared/types/tournament.types';
import type { TournamentUploadInput } from '../validators/tournament-upload.validator';
import {
  findSeasonForDate,
  getGolferCountTier,
  getStatsKey,
  matchOrCreateGolfers,
  normalizeGolferKey,
  upsertTournament,
  bulkUpsertScores,
  reconcileParticipation,
  setParticipants,
  recalcGolferStats,
  type ScoreEntry,
} from './upload-core';

export interface TournamentUploadResult {
  tournamentCreated: boolean;
  tournamentName: string;
  golfersCreated: number;
  golfersMatched: number;
  newGolferNames: string[];
  scoresEntered: number;
  summary: string;
}

export async function processTournamentUpload(
  data: TournamentUploadInput
): Promise<TournamentUploadResult> {
  const { db } = await connectToDatabase();
  const golfersCol = db.collection<GolferDocument>(GOLFERS_COLLECTION);
  const tournamentsCol = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);
  const scoresCol = db.collection<ScoreDocument>(SCORES_COLLECTION);
  const seasonsCol = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  const now = new Date();

  // Parse the tournament date using local-date construction to avoid UTC off-by-one issues
  const [year, month, day] = data.date.split('-').map(Number);
  const tournamentDate = new Date(year, month - 1, day);

  // Find the matching season
  const allSeasons = await seasonsCol.find({}).sort({ startDate: -1 }).toArray();
  const matchedSeason = findSeasonForDate(tournamentDate, allSeasons);

  if (!matchedSeason) {
    throw new Error(
      `No season found for date ${data.date}. Please create a season that covers this date first.`
    );
  }

  const seasonNumber = parseInt(matchedSeason.name, 10) || 0;

  // Resolve tournament type config
  const tournamentType = data.tournamentType as TournamentType;
  const typeConfig = TOURNAMENT_TYPE_CONFIG[tournamentType];
  const multiplier = typeConfig?.multiplier ?? 1;
  const scoringFormat = (typeConfig?.forcedScoringFormat ?? data.scoringFormat) as ScoringFormat;
  const isMultiDay = data.isMultiDay;

  // Dedupe golfers by normalized name (later occurrence wins), preserving score/position data.
  const entryByKey = new Map<string, (typeof data.golfers)[number]>();
  for (const golfer of data.golfers) {
    entryByKey.set(normalizeGolferKey(golfer.firstName, golfer.lastName), golfer);
  }
  const uniqueEntries = [...entryByKey.entries()];
  const tier = getGolferCountTier(uniqueEntries.length);

  // Match or create golfers (one find + one insertMany)
  const { idByKey, createdNames, matchedCount } = await matchOrCreateGolfers(
    golfersCol,
    uniqueEntries.map(([, g]) => ({
      firstName: g.firstName,
      lastName: g.lastName,
      price: g.price,
    })),
    now
  );

  // Idempotently create/reuse the tournament
  const { tournamentId, created } = await upsertTournament(
    tournamentsCol,
    {
      name: data.name,
      season: seasonNumber,
      startDate: tournamentDate,
      endDate: tournamentDate,
      tournamentType,
      scoringFormat,
      isMultiDay,
      multiplier,
      golferCountTier: tier,
    },
    now
  );

  // Build score entries for each unique golfer
  const scoreEntries: ScoreEntry[] = [];
  const currentGolferIds: ObjectId[] = [];
  for (const [key, g] of uniqueEntries) {
    const golferId = idByKey.get(key);
    if (!golferId) continue;
    currentGolferIds.push(golferId);
    scoreEntries.push({ golferId, position: g.position, rawScore: g.rawScore });
  }

  // Upsert all scores in one bulkWrite
  const scoresEntered = await bulkUpsertScores(
    scoresCol,
    tournamentId,
    scoreEntries,
    scoringFormat,
    isMultiDay,
    multiplier,
    tournamentType,
    now
  );

  // Reconcile participation and participant list (replacement semantics for re-uploads)
  await reconcileParticipation(scoresCol, tournamentId, currentGolferIds, now);
  await setParticipants(tournamentsCol, tournamentId, currentGolferIds, now);

  // Recalculate stats for affected golfers in this season (one read + one bulkWrite)
  const statsKey = getStatsKey(seasonNumber);
  const seasonTournaments = await tournamentsCol
    .find({ season: seasonNumber })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();
  const seasonTournamentIds = seasonTournaments.map((t) => t._id);

  await recalcGolferStats(
    golfersCol,
    scoresCol,
    currentGolferIds,
    [{ statsKey, tournamentIds: seasonTournamentIds }],
    now
  );

  const summary =
    `Tournament "${data.name}" ${created ? 'created' : 'updated'} with ${scoresEntered} golfers. ` +
    `${createdNames.length} new golfers created, ${matchedCount} existing golfers matched.` +
    (createdNames.length > 0 ? ` New golfers: ${createdNames.join(', ')}.` : '');

  return {
    tournamentCreated: created,
    tournamentName: data.name,
    golfersCreated: createdNames.length,
    golfersMatched: matchedCount,
    newGolferNames: createdNames,
    scoresEntered,
    summary,
  };
}
