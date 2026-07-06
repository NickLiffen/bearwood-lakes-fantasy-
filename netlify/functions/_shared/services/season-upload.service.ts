// Season Upload Service — processes CSV uploads of prior season golf results.
// Routes all writes through the shared batched upload-core so large CSVs complete in a bounded
// number of DB round-trips (resolve golfers once, batch scores per date group, one recalc per
// affected season) instead of ~5-6 round-trips per row.

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
  type SeasonRecalcSpec,
} from './upload-core';

export interface SeasonUploadResult {
  golfersCreated: number;
  golfersUpdated: number;
  tournamentsCreated: number;
  scoresEntered: number;
  summary: string;
}

interface CsvRow {
  date: string;
  position: number;
  player: string;
  rawScore: number;
  tournamentType: string;
  scoringFormat: string;
  isMultiDay: boolean;
}

function stripQuotes(value: string): string {
  let cleaned = value.trim();
  if (cleaned.startsWith('"')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.endsWith('"')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned.trim();
}

function parseCsv(csvText: string): CsvRow[] {
  const lines = csvText.split('\n');
  const rows: CsvRow[] = [];

  // Detect delimiter from header (tab or comma)
  const header = lines[0] || '';
  const delimiter = header.includes('\t') ? '\t' : ',';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(delimiter);
    if (parts.length < 4) continue;

    const rawScore = parseInt(stripQuotes(parts[3]), 10);
    const position = parseInt(stripQuotes(parts[1]), 10);

    if (isNaN(position) || isNaN(rawScore)) continue;

    const multiDayStr = parts[6] ? stripQuotes(parts[6]).toLowerCase() : '';
    const isMultiDay = multiDayStr === 'yes' || multiDayStr === 'true' || multiDayStr === '1';

    rows.push({
      date: stripQuotes(parts[0]),
      position,
      player: stripQuotes(parts[2]),
      rawScore,
      tournamentType: parts[4] ? stripQuotes(parts[4]).toLowerCase() : 'rollup_stableford',
      scoringFormat: parts[5] ? stripQuotes(parts[5]).toLowerCase() : 'stableford',
      isMultiDay,
    });
  }

  return rows;
}

function parseDate(dateStr: string): Date {
  // Support both DD/MM/YYYY and YYYY-MM-DD formats
  if (dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function formatTournamentName(dateStr: string): string {
  return `${dateStr} Tournament`;
}

function parsePlayerName(player: string): { firstName: string; lastName: string } {
  const trimmed = player.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.substring(0, spaceIndex),
    lastName: trimmed.substring(spaceIndex + 1),
  };
}

export async function processSeasonUpload(csvText: string): Promise<SeasonUploadResult> {
  const { db } = await connectToDatabase();
  const golfersCol = db.collection<GolferDocument>(GOLFERS_COLLECTION);
  const tournamentsCol = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);
  const scoresCol = db.collection<ScoreDocument>(SCORES_COLLECTION);
  const seasonsCol = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  const now = new Date();
  const allSeasons = await seasonsCol.find({}).sort({ startDate: -1 }).toArray();

  const rows = parseCsv(csvText);

  // Group rows by date (each date becomes one tournament)
  const dateGroups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const existing = dateGroups.get(row.date) || [];
    existing.push(row);
    dateGroups.set(row.date, existing);
  }

  // Resolve every golfer referenced in the CSV once (one find + one insertMany), rather than
  // scanning the golfers collection per row.
  const { idByKey, createdNames, matchedCount } = await matchOrCreateGolfers(
    golfersCol,
    rows.map((row) => {
      const { firstName, lastName } = parsePlayerName(row.player);
      return { firstName, lastName };
    }),
    now
  );

  let tournamentsCreated = 0;
  let scoresEntered = 0;
  const affectedGolferIds = new Map<string, ObjectId>();
  const unmatchedDates: string[] = [];
  const seasonsAffected = new Set<number>();

  for (const [dateStr, group] of dateGroups) {
    const date = parseDate(dateStr);
    const matchedSeason = findSeasonForDate(date, allSeasons);

    if (!matchedSeason) {
      unmatchedDates.push(dateStr);
      continue;
    }

    const seasonNumber = parseInt(matchedSeason.name, 10) || 0;
    seasonsAffected.add(seasonNumber);
    const name = formatTournamentName(dateStr);
    const tier = getGolferCountTier(group.length);

    // Tournament type / scoring format / multi-day come from the first row in the group.
    const csvType = (group[0].tournamentType || 'rollup_stableford') as TournamentType;
    const csvScoringFormat = (group[0].scoringFormat || 'stableford') as ScoringFormat;
    const typeConfig = TOURNAMENT_TYPE_CONFIG[csvType];
    const multiplier = typeConfig?.multiplier ?? 1;
    const isMultiDay = group[0].isMultiDay;
    const scoringFormat = (typeConfig?.forcedScoringFormat ?? csvScoringFormat) as ScoringFormat;

    const { tournamentId, created } = await upsertTournament(
      tournamentsCol,
      {
        name,
        season: seasonNumber,
        startDate: date,
        endDate: date,
        tournamentType: csvType,
        scoringFormat,
        isMultiDay,
        multiplier,
        golferCountTier: tier,
      },
      now
    );
    if (created) tournamentsCreated++;

    // Build one score entry per golfer in the group (dedupe by golfer, later row wins).
    const entryByGolfer = new Map<string, ScoreEntry>();
    for (const row of group) {
      const { firstName, lastName } = parsePlayerName(row.player);
      const golferId = idByKey.get(normalizeGolferKey(firstName, lastName));
      if (!golferId) continue;
      affectedGolferIds.set(golferId.toString(), golferId);
      entryByGolfer.set(golferId.toString(), {
        golferId,
        position: row.position,
        rawScore: row.rawScore,
      });
    }

    const entries = [...entryByGolfer.values()];
    const currentGolferIds = entries.map((e) => e.golferId);

    scoresEntered += await bulkUpsertScores(
      scoresCol,
      tournamentId,
      entries,
      scoringFormat,
      isMultiDay,
      multiplier,
      csvType,
      now
    );

    await reconcileParticipation(scoresCol, tournamentId, currentGolferIds, now);
    await setParticipants(tournamentsCol, tournamentId, currentGolferIds, now);
  }

  // Recalculate stats once per affected season for all affected golfers.
  const recalcSpecs: SeasonRecalcSpec[] = [];
  for (const seasonNumber of seasonsAffected) {
    const seasonTournaments = await tournamentsCol
      .find({ season: seasonNumber })
      .project<{ _id: ObjectId }>({ _id: 1 })
      .toArray();
    const tournamentIds = seasonTournaments.map((t) => t._id);
    if (tournamentIds.length === 0) continue;
    recalcSpecs.push({ statsKey: getStatsKey(seasonNumber), tournamentIds });
  }

  await recalcGolferStats(
    golfersCol,
    scoresCol,
    [...affectedGolferIds.values()],
    recalcSpecs,
    now
  );

  const golfersCreated = createdNames.length;
  const golfersUpdated = matchedCount;

  let summary =
    `Processed ${rows.length} rows: ` +
    `${golfersCreated} golfers created, ${golfersUpdated} existing golfers matched, ` +
    `${tournamentsCreated} tournaments created, ${scoresEntered} scores entered.`;

  if (unmatchedDates.length > 0) {
    summary += ` Warning: ${unmatchedDates.length} dates did not match any season: ${unmatchedDates.join(', ')}.`;
  }

  return {
    golfersCreated,
    golfersUpdated,
    tournamentsCreated,
    scoresEntered,
    summary,
  };
}
