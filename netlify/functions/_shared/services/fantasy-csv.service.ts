// Fantasy CSV export service
// Generates a wide-format CSV with per-gameweek points and ownership % for every active golfer.

import { connectToDatabase } from '../db';
import { GolferDocument, GOLFERS_COLLECTION } from '../models/Golfer';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from '../models/Tournament';
import { ScoreDocument, SCORES_COLLECTION } from '../models/Score';
import { PickDocument, PICKS_COLLECTION } from '../models/Pick';
import { SeasonDocument, SEASONS_COLLECTION } from '../models/Season';
import { getWeekStart, getGameweekNumber } from '../utils/dates';

export interface FantasyCsvOptions {
  season?: number;
}

export interface GolferCsvRow {
  name: string;
  value: number;
  gameweekPoints: Map<number, number>;
  gameweekOwnership: Map<number, number>;
  // Running total of tournaments this golfer has participated in
  // up to and including each gameweek.
  gameweekCumulativePlays: Map<number, number>;
  totalPoints: number;
  currentOwnership: number;
}

export interface FantasyCsvResult {
  rows: GolferCsvRow[];
  maxGameweek: number;
  csv: string;
}

/**
 * Generate the full fantasy stats CSV from MongoDB data.
 */
export async function generateFantasyCsv(
  options: FantasyCsvOptions = {}
): Promise<FantasyCsvResult> {
  const { db } = await connectToDatabase();

  // 1. Load season
  const seasonsCol = db.collection<SeasonDocument>(SEASONS_COLLECTION);
  let season: SeasonDocument | null;
  if (options.season) {
    season = await seasonsCol.findOne({ name: String(options.season) });
  } else {
    season = await seasonsCol.findOne({ isActive: true });
  }
  if (!season) throw new Error('Season not found');

  const seasonNumber = parseInt(season.name, 10);
  const seasonStartDate = new Date(season.startDate);
  const firstGW = season.firstGameweekStart ? new Date(season.firstGameweekStart) : null;

  // 2. Load active golfers
  const golfers = await db
    .collection<GolferDocument>(GOLFERS_COLLECTION)
    .find({ isActive: true })
    .toArray();

  // 3. Load published/complete tournaments for this season
  const tournaments = await db
    .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
    .find({ season: seasonNumber, status: { $in: ['published', 'complete'] } })
    .toArray();

  // Map tournament → gameweek number
  const tournamentGwMap = new Map<string, number>();
  for (const t of tournaments) {
    const weekStart = getWeekStart(new Date(t.startDate), firstGW);
    const gwNum = getGameweekNumber(weekStart, seasonStartDate, firstGW);
    tournamentGwMap.set(t._id.toString(), gwNum);
  }

  // 4. Load scores for those tournaments
  const tournamentIds = tournaments.map((t) => t._id);
  const scores = await db
    .collection<ScoreDocument>(SCORES_COLLECTION)
    .find({ tournamentId: { $in: tournamentIds } })
    .toArray();

  // Accumulate golfer → GW → total multipliedPoints
  // and golfer → GW → count of tournaments actually played (participated === true).
  const golferGwPoints = new Map<string, Map<number, number>>();
  const golferGwPlays = new Map<string, Map<number, number>>();
  for (const score of scores) {
    const golferId = score.golferId.toString();
    const gwNum = tournamentGwMap.get(score.tournamentId.toString());
    if (gwNum === undefined) continue;

    if (!golferGwPoints.has(golferId)) golferGwPoints.set(golferId, new Map());
    const gwMap = golferGwPoints.get(golferId)!;
    gwMap.set(gwNum, (gwMap.get(gwNum) || 0) + score.multipliedPoints);

    if (score.participated) {
      if (!golferGwPlays.has(golferId)) golferGwPlays.set(golferId, new Map());
      const playMap = golferGwPlays.get(golferId)!;
      playMap.set(gwNum, (playMap.get(gwNum) || 0) + 1);
    }
  }

  // 5. Load picks for this season
  const picks = await db
    .collection<PickDocument>(PICKS_COLLECTION)
    .find({ season: seasonNumber })
    .toArray();
  const totalPicks = picks.length;

  // 6. Per-gameweek ownership counts
  const maxGameweek = Math.max(0, ...Array.from(tournamentGwMap.values()));
  const golferGwOwnership = new Map<string, Map<number, number>>();

  for (let gw = 1; gw <= maxGameweek; gw++) {
    const gwStr = String(gw);
    for (const pick of picks) {
      const rosterGolferIds = resolveRosterForGw(pick, gw, gwStr);

      for (const golferId of rosterGolferIds) {
        if (!golferGwOwnership.has(golferId)) golferGwOwnership.set(golferId, new Map());
        const ownerMap = golferGwOwnership.get(golferId)!;
        ownerMap.set(gw, (ownerMap.get(gw) || 0) + 1);
      }
    }
  }

  // 7. Current ownership (same logic as golfers-list.ts)
  const currentOwnershipMap = new Map<string, number>();
  for (const pick of picks) {
    for (const gId of pick.golferIds) {
      const key = gId.toString();
      currentOwnershipMap.set(key, (currentOwnershipMap.get(key) || 0) + 1);
    }
  }

  // 8. Build rows
  const rows: GolferCsvRow[] = golfers.map((golfer) => {
    const golferId = golfer._id.toString();
    const gwPoints = golferGwPoints.get(golferId) || new Map<number, number>();
    const gwOwnershipCounts = golferGwOwnership.get(golferId) || new Map<number, number>();
    const gwPlays = golferGwPlays.get(golferId) || new Map<number, number>();

    let totalPoints = 0;
    for (const pts of gwPoints.values()) totalPoints += pts;

    const currentCount = currentOwnershipMap.get(golferId) || 0;
    const currentOwnership = totalPicks > 0 ? roundPct(currentCount / totalPicks) : 0;

    const gwOwnershipPct = new Map<number, number>();
    for (const [gw, count] of gwOwnershipCounts) {
      gwOwnershipPct.set(gw, totalPicks > 0 ? roundPct(count / totalPicks) : 0);
    }

    // Build cumulative plays series across 1..maxGameweek so a flat week
    // (no plays) still emits the running total from the previous week.
    const gwCumulativePlays = new Map<number, number>();
    let runningPlays = 0;
    for (let gw = 1; gw <= maxGameweek; gw++) {
      runningPlays += gwPlays.get(gw) || 0;
      gwCumulativePlays.set(gw, runningPlays);
    }

    return {
      name: `${golfer.firstName} ${golfer.lastName}`,
      value: golfer.price,
      gameweekPoints: gwPoints,
      gameweekOwnership: gwOwnershipPct,
      gameweekCumulativePlays: gwCumulativePlays,
      totalPoints,
      currentOwnership,
    };
  });

  rows.sort((a, b) => b.totalPoints - a.totalPoints);

  const csv = generateCsvString(rows, maxGameweek);
  return { rows, maxGameweek, csv };
}

/**
 * Resolve which golfer IDs were on a pick's roster for a given gameweek.
 * Uses gameweekRosters with fallback to current golferIds.
 */
function resolveRosterForGw(pick: PickDocument, gw: number, gwStr: string): string[] {
  if (pick.gameweekRosters) {
    // Direct match for this GW
    if (pick.gameweekRosters[gwStr]) {
      return pick.gameweekRosters[gwStr].golferIds.map((id) => id.toString());
    }

    // Find highest GW key <= current GW (mirrors getRosterForGameweek logic)
    const keys = Object.keys(pick.gameweekRosters)
      .map(Number)
      .filter((k) => !isNaN(k))
      .sort((a, b) => a - b);

    let bestKey: string | null = null;
    for (const key of keys) {
      if (key <= gw) bestKey = String(key);
      else break;
    }

    if (bestKey && pick.gameweekRosters[bestKey]) {
      return pick.gameweekRosters[bestKey].golferIds.map((id) => id.toString());
    }
  }

  // No rosters at all — fall back to current roster
  return pick.golferIds.map((id) => id.toString());
}

/** Round a ratio (0-1) to 1 decimal place percentage. */
function roundPct(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

/**
 * Convert GolferCsvRow[] to a CSV string with proper RFC 4180 escaping.
 */
export function generateCsvString(rows: GolferCsvRow[], maxGameweek: number): string {
  const headers = ['Golfer_name', 'Value'];
  for (let gw = 1; gw <= maxGameweek; gw++) {
    headers.push(`Gameweek_${gw}_Points`);
    headers.push(`Gameweek_${gw}_Ownership_Percentage`);
    headers.push(`Gameweek_${gw}_Times_Played`);
  }
  headers.push('Total_Points', 'Current_Ownership_Percentage');

  const lines = [headers.join(',')];

  for (const row of rows) {
    const cells: string[] = [escapeCsvField(row.name), String(row.value)];

    for (let gw = 1; gw <= maxGameweek; gw++) {
      cells.push(String(row.gameweekPoints.get(gw) || 0));
      cells.push(String(row.gameweekOwnership.get(gw) || 0));
      cells.push(String(row.gameweekCumulativePlays.get(gw) || 0));
    }

    cells.push(String(row.totalPoints));
    cells.push(String(row.currentOwnership));
    lines.push(cells.join(','));
  }

  return lines.join('\r\n');
}

/** Escape a CSV field per RFC 4180. */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
