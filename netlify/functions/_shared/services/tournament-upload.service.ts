// Tournament Upload Service — processes PDF-parsed tournament data
// Creates tournament, matches/creates golfers, enters scores, recalculates stats

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
import {
  getBasePointsForPosition,
  getBonusPoints,
  TOURNAMENT_TYPE_CONFIG,
  type TournamentType,
  type ScoringFormat,
  type GolferCountTier,
} from '../../../../shared/types/tournament.types';
import type { TournamentUploadInput } from '../validators/tournament-upload.validator';

export interface TournamentUploadResult {
  tournamentCreated: boolean;
  tournamentName: string;
  golfersCreated: number;
  golfersMatched: number;
  newGolferNames: string[];
  scoresEntered: number;
  summary: string;
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

// NOTE: This handles 2024, 2025, and 2026 seasons. When a new season field is added
// to the model (e.g., stats2027), this function must be updated to include it.
function getStatsKey(season: number): 'stats2024' | 'stats2025' | 'stats2026' {
  if (season === 2026) return 'stats2026';
  if (season === 2025) return 'stats2025';
  return 'stats2024';
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

  // Get tournament type config
  const tournamentType = data.tournamentType as TournamentType;
  const typeConfig = TOURNAMENT_TYPE_CONFIG[tournamentType];
  const multiplier = typeConfig?.multiplier ?? 1;
  const scoringFormat = (typeConfig?.forcedScoringFormat ?? data.scoringFormat) as ScoringFormat;
  const isMultiDay = data.isMultiDay;
  const tier = getGolferCountTier(data.golfers.length);

  // Check if tournament already exists (case-insensitive name match within season)
  const existingTournament = await tournamentsCol.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(data.name.trim())}$`, 'i') },
    season: seasonNumber,
  });

  if (existingTournament) {
    throw new Error(
      `A tournament named "${data.name}" already exists in season ${seasonNumber}. ` +
        'Please use a different name or edit the existing tournament.'
    );
  }

  // Create the tournament
  const newTournament: Omit<TournamentDocument, '_id'> = {
    name: data.name,
    startDate: tournamentDate,
    endDate: tournamentDate,
    tournamentType,
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

  const tournamentResult = await tournamentsCol.insertOne(newTournament as TournamentDocument);
  const tournamentId = tournamentResult.insertedId;

  // Process each golfer
  const createdGolferNames: string[] = [];
  let golfersMatched = 0;
  let scoresEntered = 0;
  const affectedGolferIds = new Set<string>();

  for (const golferData of data.golfers) {
    // Case-insensitive match on first and last name
    const golfer = await golfersCol.findOne({
      firstName: { $regex: new RegExp(`^${escapeRegex(golferData.firstName)}$`, 'i') },
      lastName: { $regex: new RegExp(`^${escapeRegex(golferData.lastName)}$`, 'i') },
    });

    let golferId: ObjectId;

    if (golfer) {
      golferId = golfer._id;
      golfersMatched++;
    } else {
      // Create new golfer with provided price or fallback to minimum
      const newGolfer: Omit<GolferDocument, '_id'> = {
        firstName: golferData.firstName,
        lastName: golferData.lastName,
        picture: '',
        price: golferData.price ?? 1,
        isActive: true,
        stats2024: { ...defaultStats2024 },
        stats2025: { ...defaultStats2025 },
        stats2026: { ...defaultStats2026 },
        createdAt: now,
        updatedAt: now,
      };
      const result = await golfersCol.insertOne(newGolfer as GolferDocument);
      golferId = result.insertedId;
      createdGolferNames.push(`${golferData.firstName} ${golferData.lastName}`);
    }

    affectedGolferIds.add(golferId.toString());

    // Calculate fantasy points
    const basePoints = getBasePointsForPosition(golferData.position);
    const bonusPoints = getBonusPoints(golferData.rawScore, scoringFormat, isMultiDay);
    const multipliedPoints = (basePoints + bonusPoints) * multiplier;

    // Upsert score
    await scoresCol.updateOne(
      { golferId, tournamentId },
      {
        $set: {
          participated: true,
          position: golferData.position,
          rawScore: golferData.rawScore,
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

  // Recalculate stats for all affected golfers in this season
  const statsKey = getStatsKey(seasonNumber);
  const seasonTournamentIds = await tournamentsCol
    .find({ season: seasonNumber })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();
  const allTournamentIds = seasonTournamentIds.map((t) => t._id);

  for (const golferIdStr of affectedGolferIds) {
    const golferId = new ObjectId(golferIdStr);

    const scores = await scoresCol
      .find({
        golferId,
        tournamentId: { $in: allTournamentIds },
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

  const summary =
    `Tournament "${data.name}" created with ${scoresEntered} golfers. ` +
    `${createdGolferNames.length} new golfers created, ${golfersMatched} existing golfers matched.` +
    (createdGolferNames.length > 0 ? ` New golfers: ${createdGolferNames.join(', ')}.` : '');

  return {
    tournamentCreated: true,
    tournamentName: data.name,
    golfersCreated: createdGolferNames.length,
    golfersMatched,
    newGolferNames: createdGolferNames,
    scoresEntered,
    summary,
  };
}
