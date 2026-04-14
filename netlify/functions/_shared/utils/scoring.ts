// Shared scoring utility — single source of truth for calculating user points
// with captain multiplier and time-boundary filtering.
//
// Supports per-gameweek rosters so that transferred-out golfers still earn
// points for the gameweeks they were active during.

import type { ObjectId } from 'mongodb';
import { getTeamEffectiveStartDate, getWeekStart, getGameweekNumber } from './dates';

/** Minimal score fields needed for scoring calculations. */
export interface ScoreLike {
  golferId: ObjectId;
  tournamentId: ObjectId;
  multipliedPoints: number;
}

export interface TimeBoundaries {
  weekStart: Date;
  weekEnd: Date;
  monthStart: Date;
  monthEnd: Date;
  seasonStart: Date;
}

export interface PickPointsResult {
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
}

/** Roster snapshot for a gameweek (string IDs for comparison). */
export interface RosterSnapshot {
  golferIds: string[];
  captainId: string | null;
}

/**
 * Find the active roster for a given gameweek number.
 * Returns the roster with the highest gameweek key ≤ the target gameweek.
 */
export function getRosterForGameweek(
  rosters: Record<string, RosterSnapshot>,
  gameweek: number
): RosterSnapshot | null {
  const keys = Object.keys(rosters)
    .map(Number)
    .filter((k) => !isNaN(k))
    .sort((a, b) => a - b);

  let result: string | null = null;
  for (const key of keys) {
    if (key <= gameweek) result = String(key);
    else break;
  }
  return result !== null ? rosters[result] : null;
}

/**
 * Calculate week/month/season points for a single pick (team).
 *
 * When `gameweekRosters` is provided, uses per-gameweek roster lookup so
 * transferred-out golfers still earn points for the gameweeks they were
 * active during. Falls back to legacy behaviour (all points from current
 * `golferIds`) when rosters are absent.
 *
 * Applies:
 *  - captain 2x multiplier (per-gameweek captain when rosters are present)
 *  - team effective start date filtering
 *  - proper upper bounds on week and month time windows
 */
export function calculatePickPoints(
  pick: {
    golferIds: ObjectId[];
    captainId?: ObjectId | null;
    createdAt: Date;
    gameweekRosters?: Record<string, RosterSnapshot>;
    allGolferIds?: ObjectId[];
  },
  scoresByGolferTournament: Map<string, Map<string, ScoreLike>>,
  tournamentDates: Map<string, Date>,
  boundaries: TimeBoundaries,
  firstGW?: Date | null,
  seasonStartDate?: Date | null
): PickPointsResult {
  const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt, firstGW);
  const hasRosters =
    pick.gameweekRosters && Object.keys(pick.gameweekRosters).length > 0;

  // --- Gameweek-aware path (post-fix) ---
  if (hasRosters) {
    return calculateWithRosters(
      pick.gameweekRosters!,
      pick.allGolferIds || pick.golferIds,
      scoresByGolferTournament,
      tournamentDates,
      boundaries,
      teamEffectiveStart,
      firstGW,
      seasonStartDate
    );
  }

  // --- Legacy path (backwards compatibility for picks without rosters) ---
  let weekPoints = 0;
  let monthPoints = 0;
  let seasonPoints = 0;

  const captainIdStr = pick.captainId?.toString();

  for (const golferId of pick.golferIds) {
    const golferScores = scoresByGolferTournament.get(golferId.toString());
    if (!golferScores) continue;

    const isCaptain = golferId.toString() === captainIdStr;
    const captainMultiplier = isCaptain ? 2 : 1;

    for (const [tournamentId, score] of golferScores) {
      const tournamentDate = tournamentDates.get(tournamentId);
      if (!tournamentDate) continue;

      // Skip tournaments before team's effective start date
      if (tournamentDate < teamEffectiveStart) continue;

      const points = (score.multipliedPoints || 0) * captainMultiplier;

      if (tournamentDate >= boundaries.seasonStart) seasonPoints += points;
      if (tournamentDate >= boundaries.monthStart && tournamentDate <= boundaries.monthEnd) {
        monthPoints += points;
      }
      if (tournamentDate >= boundaries.weekStart && tournamentDate <= boundaries.weekEnd) {
        weekPoints += points;
      }
    }
  }

  return { weekPoints, monthPoints, seasonPoints };
}

/**
 * Internal: calculate points using per-gameweek roster lookup.
 */
function calculateWithRosters(
  rosters: Record<string, RosterSnapshot>,
  allGolferIds: ObjectId[],
  scoresByGolferTournament: Map<string, Map<string, ScoreLike>>,
  tournamentDates: Map<string, Date>,
  boundaries: TimeBoundaries,
  teamEffectiveStart: Date,
  firstGW?: Date | null,
  seasonStartDate?: Date | null
): PickPointsResult {
  let weekPoints = 0;
  let monthPoints = 0;
  let seasonPoints = 0;

  const effectiveSeasonStart = seasonStartDate || boundaries.seasonStart;

  for (const golferId of allGolferIds) {
    const golferIdStr = golferId.toString();
    const golferScores = scoresByGolferTournament.get(golferIdStr);
    if (!golferScores) continue;

    for (const [tournamentId, score] of golferScores) {
      const tournamentDate = tournamentDates.get(tournamentId);
      if (!tournamentDate) continue;
      if (tournamentDate < teamEffectiveStart) continue;

      // Determine which gameweek this tournament falls in
      const tournamentWeekStart = getWeekStart(tournamentDate, firstGW);
      const gwNum = getGameweekNumber(
        tournamentWeekStart,
        new Date(effectiveSeasonStart),
        firstGW
      );

      // Find the active roster for this gameweek
      const roster = getRosterForGameweek(rosters, gwNum);
      if (!roster) continue;

      // Check if this golfer was on the team during this gameweek
      if (!roster.golferIds.includes(golferIdStr)) continue;

      // Apply captain multiplier from the gameweek's roster
      const isCaptain = golferIdStr === roster.captainId;
      const captainMultiplier = isCaptain ? 2 : 1;
      const points = (score.multipliedPoints || 0) * captainMultiplier;

      if (tournamentDate >= boundaries.seasonStart) seasonPoints += points;
      if (tournamentDate >= boundaries.monthStart && tournamentDate <= boundaries.monthEnd) {
        monthPoints += points;
      }
      if (tournamentDate >= boundaries.weekStart && tournamentDate <= boundaries.weekEnd) {
        weekPoints += points;
      }
    }
  }

  return { weekPoints, monthPoints, seasonPoints };
}

/**
 * Calculate week/month/season points for a single golfer within a team context.
 *
 * Same scoring rules as `calculatePickPoints` but operates on one golfer at a time,
 * returning that golfer's contribution. Used by endpoints that need per-golfer
 * breakdowns (my-team, team-compare) rather than aggregated team totals.
 *
 * When `gameweekRosters` is provided, only counts tournaments where the golfer
 * was on the team during that gameweek.
 */
export function calculateGolferContribution(
  golferScores: ScoreLike[],
  tournamentDates: Map<string, Date>,
  boundaries: TimeBoundaries,
  isCaptain: boolean,
  teamEffectiveStart: Date,
  gameweekRosters?: Record<string, RosterSnapshot> | null,
  golferId?: string,
  firstGW?: Date | null,
  seasonStartDate?: Date | null
): PickPointsResult {
  let weekPoints = 0;
  let monthPoints = 0;
  let seasonPoints = 0;

  const hasRosters = gameweekRosters && Object.keys(gameweekRosters).length > 0;
  const effectiveSeasonStart = seasonStartDate || boundaries.seasonStart;

  for (const score of golferScores) {
    const tournamentDate = tournamentDates.get(score.tournamentId.toString());
    if (!tournamentDate) continue;
    if (tournamentDate < teamEffectiveStart) continue;

    // When rosters are present, verify this golfer was on the team during
    // this tournament's gameweek and use the per-GW captain assignment.
    let captainMultiplier: number;
    if (hasRosters && golferId) {
      const tournamentWeekStart = getWeekStart(tournamentDate, firstGW);
      const gwNum = getGameweekNumber(
        tournamentWeekStart,
        new Date(effectiveSeasonStart),
        firstGW
      );
      const roster = getRosterForGameweek(gameweekRosters!, gwNum);
      if (!roster || !roster.golferIds.includes(golferId)) continue;
      captainMultiplier = golferId === roster.captainId ? 2 : 1;
    } else {
      captainMultiplier = isCaptain ? 2 : 1;
    }

    const points = (score.multipliedPoints || 0) * captainMultiplier;

    if (tournamentDate >= boundaries.seasonStart) seasonPoints += points;
    if (tournamentDate >= boundaries.monthStart && tournamentDate <= boundaries.monthEnd) {
      monthPoints += points;
    }
    if (tournamentDate >= boundaries.weekStart && tournamentDate <= boundaries.weekEnd) {
      weekPoints += points;
    }
  }

  return { weekPoints, monthPoints, seasonPoints };
}
