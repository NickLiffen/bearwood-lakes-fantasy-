// Shared batched core for tournament & season uploads.
//
// Both processTournamentUpload and processSeasonUpload used to perform ~5-6 sequential
// MongoDB round-trips per golfer, which timed out for large fields (see research report).
// This module provides batched primitives that collapse those into a small, constant number
// of round-trips (load-all + insertMany + bulkWrite), plus idempotent/consistency helpers.

import { ObjectId } from 'mongodb';
import type { AnyBulkWriteOperation, Collection } from 'mongodb';
import {
  GolferDocument,
  defaultStats2024,
  defaultStats2025,
  defaultStats2026,
} from '../models/Golfer';
import { TournamentDocument } from '../models/Tournament';
import { ScoreDocument } from '../models/Score';
import { SeasonDocument } from '../models/Season';
import {
  getBasePointsForPosition,
  getBonusPoints,
  type TournamentType,
  type ScoringFormat,
  type GolferCountTier,
} from '../../../../shared/types/tournament.types';

// ---------------------------------------------------------------------------
// Shared helpers (previously duplicated across both upload services)
// ---------------------------------------------------------------------------

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getGolferCountTier(count: number): GolferCountTier {
  if (count <= 10) return '0-10';
  if (count < 20) return '10-20';
  return '20+';
}

export function findSeasonForDate(
  date: Date,
  seasons: SeasonDocument[]
): SeasonDocument | null {
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
export function getStatsKey(season: number): 'stats2024' | 'stats2025' | 'stats2026' {
  if (season === 2026) return 'stats2026';
  if (season === 2025) return 'stats2025';
  return 'stats2024';
}

/** Build a normalized, case-insensitive key for matching golfers by name. */
export function normalizeGolferKey(firstName: string, lastName: string): string {
  return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Golfer matching / creation (batched)
// ---------------------------------------------------------------------------

export interface GolferInput {
  firstName: string;
  lastName: string;
  price?: number;
}

export interface GolferResolution {
  /** normalized key -> golfer _id */
  idByKey: Map<string, ObjectId>;
  /** Display names ("First Last") of golfers created during this upload. */
  createdNames: string[];
  /** Count of unique input golfers matched to an existing record. */
  matchedCount: number;
}

/**
 * Resolve a list of golfer inputs to golfer ids, creating any that don't exist — all in a
 * bounded number of round-trips (one find + one insertMany).
 *
 * - Loads the entire golfers collection once and matches in memory (no per-golfer regex).
 * - Dedupes inputs by normalized name so a name appearing twice yields a single golfer.
 * - Fails fast if the existing collection already contains >1 golfer for a needed name
 *   (ambiguous match) rather than silently picking one.
 */
export async function matchOrCreateGolfers(
  golfersCol: Collection<GolferDocument>,
  inputs: GolferInput[],
  now: Date = new Date()
): Promise<GolferResolution> {
  // Dedupe inputs by normalized key (later occurrences win, matching prior sequential behavior).
  const inputByKey = new Map<string, GolferInput>();
  for (const input of inputs) {
    inputByKey.set(normalizeGolferKey(input.firstName, input.lastName), input);
  }

  // Load all golfers once and group ids by normalized key to detect ambiguous matches.
  const allGolfers = await golfersCol.find({}).toArray();
  const existingByKey = new Map<string, ObjectId[]>();
  for (const g of allGolfers) {
    const key = normalizeGolferKey(g.firstName, g.lastName);
    const list = existingByKey.get(key);
    if (list) list.push(g._id);
    else existingByKey.set(key, [g._id]);
  }

  const idByKey = new Map<string, ObjectId>();
  const ambiguous: string[] = [];
  const toCreate: { key: string; doc: Omit<GolferDocument, '_id'> }[] = [];
  const createdNames: string[] = [];
  let matchedCount = 0;

  for (const [key, input] of inputByKey) {
    const existing = existingByKey.get(key);
    if (existing && existing.length > 1) {
      ambiguous.push(`${input.firstName} ${input.lastName}`.trim());
      continue;
    }
    if (existing && existing.length === 1) {
      idByKey.set(key, existing[0]);
      matchedCount++;
      continue;
    }
    // Queue a new golfer (deduped — one per key).
    toCreate.push({
      key,
      doc: {
        firstName: input.firstName,
        lastName: input.lastName,
        picture: '',
        price: input.price ?? 1,
        isActive: true,
        stats2024: { ...defaultStats2024 },
        stats2025: { ...defaultStats2025 },
        stats2026: { ...defaultStats2026 },
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  if (ambiguous.length > 0) {
    throw new Error(
      `Ambiguous golfer match — multiple existing golfers share these names: ` +
        `${ambiguous.join(', ')}. Please resolve the duplicates before uploading.`
    );
  }

  if (toCreate.length > 0) {
    const docs = toCreate.map((c) => c.doc as GolferDocument);
    const result = await golfersCol.insertMany(docs);
    toCreate.forEach((c, i) => {
      const insertedId = result.insertedIds[i];
      idByKey.set(c.key, insertedId);
      createdNames.push(`${c.doc.firstName} ${c.doc.lastName}`.trim());
    });
  }

  return { idByKey, createdNames, matchedCount };
}

// ---------------------------------------------------------------------------
// Tournament upsert (idempotent)
// ---------------------------------------------------------------------------

export interface TournamentMeta {
  name: string;
  season: number;
  startDate: Date;
  endDate: Date;
  tournamentType: TournamentType;
  scoringFormat: ScoringFormat;
  isMultiDay: boolean;
  multiplier: number;
  golferCountTier: GolferCountTier;
}

export interface TournamentUpsertResult {
  tournamentId: ObjectId;
  created: boolean;
}

/**
 * Find (case-insensitive by name + season) or create a tournament. Idempotent: re-uploading the
 * same tournament reuses the existing record and refreshes its scoring metadata, but preserves
 * the existing `status` (so a manually published/edited tournament is not clobbered).
 */
export async function upsertTournament(
  tournamentsCol: Collection<TournamentDocument>,
  meta: TournamentMeta,
  now: Date = new Date()
): Promise<TournamentUpsertResult> {
  const existing = await tournamentsCol.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(meta.name.trim())}$`, 'i') },
    season: meta.season,
  });

  if (existing) {
    // Preserve status and participants; refresh scoring metadata only.
    await tournamentsCol.updateOne(
      { _id: existing._id },
      {
        $set: {
          startDate: meta.startDate,
          endDate: meta.endDate,
          tournamentType: meta.tournamentType,
          scoringFormat: meta.scoringFormat,
          isMultiDay: meta.isMultiDay,
          multiplier: meta.multiplier,
          golferCountTier: meta.golferCountTier,
          updatedAt: now,
        },
      }
    );
    return { tournamentId: existing._id, created: false };
  }

  const newTournament: Omit<TournamentDocument, '_id'> = {
    name: meta.name,
    startDate: meta.startDate,
    endDate: meta.endDate,
    tournamentType: meta.tournamentType,
    scoringFormat: meta.scoringFormat,
    isMultiDay: meta.isMultiDay,
    multiplier: meta.multiplier,
    golferCountTier: meta.golferCountTier,
    season: meta.season,
    status: 'complete',
    participatingGolferIds: [],
    createdAt: now,
    updatedAt: now,
  };
  const result = await tournamentsCol.insertOne(newTournament as TournamentDocument);
  return { tournamentId: result.insertedId, created: true };
}

// ---------------------------------------------------------------------------
// Score writes (batched)
// ---------------------------------------------------------------------------

export interface ScoreEntry {
  golferId: ObjectId;
  position: number;
  rawScore: number;
}

/**
 * Compute fantasy points and upsert all scores for a tournament in a single bulkWrite.
 * Backed by the unique { tournamentId, golferId } index; inputs must already be deduped by
 * golferId (see matchOrCreateGolfers) so no duplicate-key conflicts occur.
 */
export async function bulkUpsertScores(
  scoresCol: Collection<ScoreDocument>,
  tournamentId: ObjectId,
  entries: ScoreEntry[],
  scoringFormat: ScoringFormat,
  isMultiDay: boolean,
  multiplier: number,
  tournamentType: TournamentType,
  now: Date = new Date()
): Promise<number> {
  if (entries.length === 0) return 0;

  const ops: AnyBulkWriteOperation<ScoreDocument>[] = entries.map((entry) => {
    const basePoints = getBasePointsForPosition(entry.position, tournamentType);
    const bonusPoints = getBonusPoints(entry.rawScore, scoringFormat, isMultiDay);
    const multipliedPoints = (basePoints + bonusPoints) * multiplier;
    return {
      updateOne: {
        filter: { golferId: entry.golferId, tournamentId },
        update: {
          $set: {
            participated: true,
            position: entry.position,
            rawScore: entry.rawScore,
            basePoints,
            bonusPoints,
            multipliedPoints,
            updatedAt: now,
          },
          $setOnInsert: {
            golferId: entry.golferId,
            tournamentId,
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  try {
    await scoresCol.bulkWrite(ops, { ordered: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write tournament scores: ${message}`);
  }

  return entries.length;
}

/**
 * Replacement semantics: mark any existing scores for this tournament whose golfer is NOT in the
 * current upload as not-participated, so participants and recalculated stats stay consistent when
 * a golfer is dropped from a re-upload.
 */
export async function reconcileParticipation(
  scoresCol: Collection<ScoreDocument>,
  tournamentId: ObjectId,
  currentGolferIds: ObjectId[],
  now: Date = new Date()
): Promise<void> {
  await scoresCol.updateMany(
    { tournamentId, golferId: { $nin: currentGolferIds }, participated: true },
    { $set: { participated: false, updatedAt: now } }
  );
}

/** Set a tournament's participating golfers to exactly the provided ids (deduped). */
export async function setParticipants(
  tournamentsCol: Collection<TournamentDocument>,
  tournamentId: ObjectId,
  golferIds: ObjectId[],
  now: Date = new Date()
): Promise<void> {
  const deduped = Array.from(new Map(golferIds.map((id) => [id.toString(), id])).values());
  await tournamentsCol.updateOne(
    { _id: tournamentId },
    { $set: { participatingGolferIds: deduped, updatedAt: now } }
  );
}

// ---------------------------------------------------------------------------
// Stats recalculation (batched)
// ---------------------------------------------------------------------------

interface GolferStats {
  timesPlayed: number;
  timesScored36Plus: number;
  timesScored32Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
}

function emptyStats(): GolferStats {
  return {
    timesPlayed: 0,
    timesScored36Plus: 0,
    timesScored32Plus: 0,
    timesFinished1st: 0,
    timesFinished2nd: 0,
    timesFinished3rd: 0,
  };
}

export interface SeasonRecalcSpec {
  statsKey: 'stats2024' | 'stats2025' | 'stats2026';
  tournamentIds: ObjectId[];
}

/**
 * Recalculate season stats for the affected golfers using a bounded number of round-trips:
 * one score read + one bulkWrite per affected season. Golfers with no participated scores are
 * reset to zero (so dropping a golfer on re-upload correctly clears their stats).
 */
export async function recalcGolferStats(
  golfersCol: Collection<GolferDocument>,
  scoresCol: Collection<ScoreDocument>,
  affectedGolferIds: ObjectId[],
  seasons: SeasonRecalcSpec[],
  now: Date = new Date()
): Promise<void> {
  if (affectedGolferIds.length === 0) return;

  for (const { statsKey, tournamentIds } of seasons) {
    if (tournamentIds.length === 0) continue;

    // Initialize every affected golfer to zero so retired golfers get cleared.
    const statsByGolfer = new Map<string, GolferStats>();
    for (const id of affectedGolferIds) {
      statsByGolfer.set(id.toString(), emptyStats());
    }

    const scores = await scoresCol
      .find({
        golferId: { $in: affectedGolferIds },
        tournamentId: { $in: tournamentIds },
        participated: true,
      })
      .toArray();

    for (const s of scores) {
      const stats = statsByGolfer.get(s.golferId.toString());
      if (!stats) continue;
      stats.timesPlayed++;
      if ((s.rawScore ?? 0) >= 36) stats.timesScored36Plus++;
      if ((s.rawScore ?? 0) >= 32) stats.timesScored32Plus++;
      if (s.position === 1) stats.timesFinished1st++;
      if (s.position === 2) stats.timesFinished2nd++;
      if (s.position === 3) stats.timesFinished3rd++;
    }

    const ops: AnyBulkWriteOperation<GolferDocument>[] = [];
    for (const [golferIdStr, stats] of statsByGolfer) {
      ops.push({
        updateOne: {
          filter: { _id: new ObjectId(golferIdStr) },
          update: { $set: { [statsKey]: stats, updatedAt: now } },
        },
      });
    }

    if (ops.length > 0) {
      await golfersCol.bulkWrite(ops, { ordered: false });
    }
  }
}
