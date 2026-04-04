// Shared scoring utility — single source of truth for calculating user points
// with captain multiplier and time-boundary filtering.

import type { ObjectId } from 'mongodb';
import { getTeamEffectiveStartDate } from './dates';

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

/**
 * Calculate week/month/season points for a single pick (team).
 *
 * Applies:
 *  - captain 2x multiplier
 *  - team effective start date filtering (skip tournaments before the team's effective
 *    start date as determined by `getTeamEffectiveStartDate()`, including first-gameweek
 *    special-casing)
 *  - proper upper bounds on week and month time windows
 */
export function calculatePickPoints(
  pick: {
    golferIds: ObjectId[];
    captainId?: ObjectId | null;
    createdAt: Date;
  },
  scoresByGolferTournament: Map<string, Map<string, ScoreLike>>,
  tournamentDates: Map<string, Date>,
  boundaries: TimeBoundaries,
  firstGW?: Date | null
): PickPointsResult {
  let weekPoints = 0;
  let monthPoints = 0;
  let seasonPoints = 0;

  const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt, firstGW);
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
 * Calculate week/month/season points for a single golfer within a team context.
 *
 * Same scoring rules as `calculatePickPoints` but operates on one golfer at a time,
 * returning that golfer's contribution. Used by endpoints that need per-golfer
 * breakdowns (my-team, team-compare) rather than aggregated team totals.
 */
export function calculateGolferContribution(
  golferScores: ScoreLike[],
  tournamentDates: Map<string, Date>,
  boundaries: TimeBoundaries,
  isCaptain: boolean,
  teamEffectiveStart: Date
): PickPointsResult {
  const captainMultiplier = isCaptain ? 2 : 1;
  let weekPoints = 0;
  let monthPoints = 0;
  let seasonPoints = 0;

  for (const score of golferScores) {
    const tournamentDate = tournamentDates.get(score.tournamentId.toString());
    if (!tournamentDate) continue;
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

  return { weekPoints, monthPoints, seasonPoints };
}
