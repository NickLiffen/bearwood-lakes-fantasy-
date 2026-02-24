// Season Upload Service — processes CSV uploads of prior season golf results

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  GolferDocument,
  GOLFERS_COLLECTION,
  defaultStats2024,
  defaultStats2025,
  defaultStats2026,
} from '../models/Golfer';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import { ScoreDocument, SCORES_COLLECTION } from '../models/Score';
import { SeasonDocument, SEASONS_COLLECTION } from '../models/Season';
import { getBasePointsForPosition, getBonusPoints, TOURNAMENT_TYPE_CONFIG, type TournamentType, type ScoringFormat, type GolferCountTier } from '../../../../shared/types/tournament.types';

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

    rows.push({
      date: stripQuotes(parts[0]),
      position,
      player: stripQuotes(parts[2]),
      rawScore,
      tournamentType: parts[4] ? stripQuotes(parts[4]).toLowerCase() : 'rollup_stableford',
      scoringFormat: parts[5] ? stripQuotes(parts[5]).toLowerCase() : 'stableford',
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

function getGolferCountTier(count: number): GolferCountTier {
  if (count <= 10) return '0-10';
  if (count < 20) return '10-20';
  return '20+';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSeasonForDate(date: Date, seasons: SeasonDocument[]): SeasonDocument | null {
  return (
    seasons.find((s) => {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      return date >= start && date <= end;
    }) || null
  );
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

// NOTE: This handles 2024, 2025, and 2026 seasons. When a new season field is added
// to the model (e.g., stats2027), this function must be updated to include it.
function getStatsKey(season: number): 'stats2024' | 'stats2025' | 'stats2026' {
  if (season === 2026) return 'stats2026';
  if (season === 2025) return 'stats2025';
  return 'stats2024';
}

export async function processSeasonUpload(csvText: string): Promise<SeasonUploadResult> {
  const { db } = await connectToDatabase();
  const golfersCol = db.collection<GolferDocument>(GOLFERS_COLLECTION);
  const tournamentsCol = db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION);
  const scoresCol = db.collection<ScoreDocument>(SCORES_COLLECTION);
  const seasonsCol = db.collection<SeasonDocument>(SEASONS_COLLECTION);

  const allSeasons = await seasonsCol.find({}).sort({ startDate: -1 }).toArray();

  const rows = parseCsv(csvText);

  // Group rows by date
  const dateGroups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const existing = dateGroups.get(row.date) || [];
    existing.push(row);
    dateGroups.set(row.date, existing);
  }

  let tournamentsCreated = 0;
  let scoresEntered = 0;
  const createdGolferIds = new Set<string>();
  const updatedGolferIds = new Set<string>();
  const affectedGolferIds = new Set<string>();
  const unmatchedDates: string[] = [];
  const seasonsAffected = new Set<string>();

  for (const [dateStr, group] of dateGroups) {
    const date = parseDate(dateStr);
    const matchedSeason = findSeasonForDate(date, allSeasons);

    if (!matchedSeason) {
      unmatchedDates.push(dateStr);
      continue;
    }

    const seasonNumber = parseInt(matchedSeason.name, 10) || 0;
    seasonsAffected.add(matchedSeason.name);
    const name = formatTournamentName(dateStr);
    const tier = getGolferCountTier(group.length);

    // Get tournament type and scoring format from the first row in the group
    const csvType = (group[0].tournamentType || 'rollup_stableford') as TournamentType;
    const csvScoringFormat = (group[0].scoringFormat || 'stableford') as ScoringFormat;
    const typeConfig = TOURNAMENT_TYPE_CONFIG[csvType];
    const multiplier = typeConfig?.multiplier ?? 1;
    const isMultiDay = typeConfig?.defaultMultiDay ?? false;
    const scoringFormat = typeConfig?.forcedScoringFormat ?? csvScoringFormat;

    // Find or create tournament
    const tournament = await tournamentsCol.findOne({ name, season: seasonNumber });
    let tournamentId: ObjectId;

    if (tournament) {
      tournamentId = tournament._id;
    } else {
      const now = new Date();
      const newTournament: Omit<TournamentDocument, '_id'> = {
        name,
        startDate: date,
        endDate: date,
        tournamentType: csvType,
        scoringFormat,
        isMultiDay,
        multiplier,
        golferCountTier: tier,
        season: seasonNumber,
        status: 'complete',
        participatingGolferIds: [],
        createdAt: now,
        updatedAt: now,
      };
      const result = await tournamentsCol.insertOne(newTournament as TournamentDocument);
      tournamentId = result.insertedId;
      tournamentsCreated++;
    }

    for (const row of group) {
      const { firstName, lastName } = parsePlayerName(row.player);

      // Find or create golfer (case-insensitive match)
      const golfer = await golfersCol.findOne({
        firstName: { $regex: new RegExp(`^${escapeRegex(firstName)}$`, 'i') },
        lastName: { $regex: new RegExp(`^${escapeRegex(lastName)}$`, 'i') },
      });

      let golferId: ObjectId;

      if (golfer) {
        golferId = golfer._id;
        updatedGolferIds.add(golferId.toString());
      } else {
        const now = new Date();
        const newGolfer: Omit<GolferDocument, '_id'> = {
          firstName,
          lastName,
          picture: '',
          price: 1,
          membershipType: 'men',
          isActive: true,
          stats2024: { ...defaultStats2024 },
          stats2025: { ...defaultStats2025 },
          stats2026: { ...defaultStats2026 },
          createdAt: now,
          updatedAt: now,
        };
        const result = await golfersCol.insertOne(newGolfer as GolferDocument);
        golferId = result.insertedId;
        createdGolferIds.add(golferId.toString());
      }

      affectedGolferIds.add(golferId.toString());

      // Calculate points using tournament's scoring format and multi-day setting
      const basePoints = getBasePointsForPosition(row.position);
      const rawScore = row.rawScore;
      const bonusPoints = getBonusPoints(rawScore, scoringFormat, isMultiDay);
      const multipliedPoints = (basePoints + bonusPoints) * multiplier;

      // Upsert score
      const now = new Date();
      await scoresCol.updateOne(
        { golferId, tournamentId },
        {
          $set: {
            participated: true,
            position: row.position,
            rawScore,
            basePoints,
            bonusPoints,
            multipliedPoints,
            updatedAt: now,
          },
          $setOnInsert: {
            golferId,
            tournamentId,
            createdAt: now,
          },
        },
        { upsert: true }
      );
      scoresEntered++;

      // Add golfer to tournament's participatingGolferIds
      await tournamentsCol.updateOne(
        { _id: tournamentId },
        { $addToSet: { participatingGolferIds: golferId } }
      );
    }
  }

  // Recalculate stats for all affected golfers, per season
  for (const seasonDoc of allSeasons) {
    const seasonNumber = parseInt(seasonDoc.name, 10) || 0;
    const statsKey = getStatsKey(seasonNumber);

    const seasonTournamentIds = await tournamentsCol
      .find({ season: seasonNumber })
      .project<{ _id: ObjectId }>({ _id: 1 })
      .toArray();
    const tournamentIds = seasonTournamentIds.map((t) => t._id);

    if (tournamentIds.length === 0) continue;

    for (const golferIdStr of affectedGolferIds) {
      const golferId = new ObjectId(golferIdStr);

      const scores = await scoresCol
        .find({
          golferId,
          tournamentId: { $in: tournamentIds },
          participated: true,
        })
        .toArray();

      const stats = {
        timesPlayed: scores.length,
        timesScored36Plus: scores.filter((s) => (s.rawScore ?? 0) >= 36).length,
        timesScored32Plus: scores.filter((s) => (s.rawScore ?? 0) >= 32).length,
        timesFinished1st: scores.filter((s) => s.position === 1).length,
        timesFinished2nd: scores.filter((s) => s.position === 2).length,
        timesFinished3rd: scores.filter((s) => s.position === 3).length,
      };

      await golfersCol.updateOne(
        { _id: golferId },
        { $set: { [statsKey]: stats, updatedAt: new Date() } }
      );
    }
  }

  // Golfers that were found (not created) — exclude any that were created in this same upload
  const golfersCreated = createdGolferIds.size;
  const golfersUpdated = [...updatedGolferIds].filter((id) => !createdGolferIds.has(id)).length;

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
