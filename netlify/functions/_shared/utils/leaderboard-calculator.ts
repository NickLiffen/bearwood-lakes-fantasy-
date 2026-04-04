// Shared leaderboard calculator — single source of truth for period-based
// leaderboard calculations used by both global and league endpoints.

import type { ScoreDocument } from '../models/Score';
import type { UserDocument } from '../models/User';
import type { PickDocument } from '../models/Pick';
import type { TournamentDocument } from '../models/Tournament';
import { getTeamEffectiveStartDate } from './dates';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface LeaderboardRawEntry {
  userId: string;
  user: UserDocument;
  points: number;
  teamValue: number;
  events: number;
}

export interface RankedLeaderboardEntry {
  rank: number;
  oldRank: number | null;
  movement: 'up' | 'down' | 'same' | 'new';
  movementAmount: number;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  points: number;
  teamValue: number;
  eventsPlayed: number;
}

export interface CalculateLeaderboardResult {
  entries: LeaderboardRawEntry[];
  tournamentCount: number;
}

// ────────────────────────────────────────────────────────────
// Core calculation
// ────────────────────────────────────────────────────────────

/**
 * Calculate leaderboard entries for a given period.
 *
 * Filters tournaments to the period window, applies captain 2× multiplier,
 * and respects team effective start dates.
 *
 * @param memberSet — optional. When provided, only picks whose userId is in
 *   the set are included (league mode). When omitted, all picks are included.
 */
export function calculateLeaderboard(
  picks: PickDocument[],
  userMap: Map<string, UserDocument>,
  tournaments: TournamentDocument[],
  allScores: ScoreDocument[],
  periodStart: Date,
  periodEnd: Date,
  firstGameweekStart?: Date | null,
  memberSet?: Set<string>,
): CalculateLeaderboardResult {
  const periodTournaments = tournaments.filter((t) => {
    const startDate = new Date(t.startDate);
    return startDate >= periodStart && startDate <= periodEnd;
  });

  const periodTournamentIds = new Set(periodTournaments.map((t) => t._id.toString()));

  const tournamentDateMap = new Map<string, Date>();
  for (const t of periodTournaments) {
    tournamentDateMap.set(t._id.toString(), new Date(t.startDate));
  }

  const scoresByPlayerAndTournament = new Map<string, Map<string, ScoreDocument>>();
  for (const score of allScores) {
    if (!periodTournamentIds.has(score.tournamentId.toString())) continue;
    const golferId = score.golferId.toString();
    if (!scoresByPlayerAndTournament.has(golferId)) {
      scoresByPlayerAndTournament.set(golferId, new Map());
    }
    scoresByPlayerAndTournament.get(golferId)!.set(score.tournamentId.toString(), score);
  }

  const entries: LeaderboardRawEntry[] = [];

  for (const pick of picks) {
    const userId = pick.userId.toString();
    if (memberSet && !memberSet.has(userId)) continue;
    const user = userMap.get(userId);
    if (!user) continue;

    const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt, firstGameweekStart);
    const captainIdStr = pick.captainId?.toString();

    let points = 0;
    const eventsSet = new Set<string>();

    for (const golferId of pick.golferIds) {
      const playerScores = scoresByPlayerAndTournament.get(golferId.toString());
      if (!playerScores) continue;

      for (const [tournamentId, score] of playerScores) {
        const tournamentDate = tournamentDateMap.get(tournamentId);
        if (tournamentDate && tournamentDate < teamEffectiveStart) continue;

        const isCaptain = score.golferId.toString() === captainIdStr;
        points += (score.multipliedPoints || 0) * (isCaptain ? 2 : 1);
        if (score.participated) eventsSet.add(tournamentId);
      }
    }

    entries.push({ userId, user, points, teamValue: pick.totalSpent, events: eventsSet.size });
  }

  return { entries, tournamentCount: periodTournaments.length };
}

// ────────────────────────────────────────────────────────────
// Ranking
// ────────────────────────────────────────────────────────────

/**
 * Rank a set of leaderboard entries, optionally comparing against a previous
 * period's entries to calculate movement (up / down / same / new).
 */
export function rankEntries(
  currentEntries: LeaderboardRawEntry[],
  previousEntries: LeaderboardRawEntry[] | null,
): RankedLeaderboardEntry[] {
  const sorted = [...currentEntries].sort((a, b) => b.points - a.points);

  const previousRankMap = new Map<string, number>();
  if (previousEntries) {
    const prevSorted = [...previousEntries].sort((a, b) => b.points - a.points);
    let prevRank = 1;
    prevSorted.forEach((entry, index) => {
      if (index > 0 && entry.points < prevSorted[index - 1].points) prevRank = index + 1;
      previousRankMap.set(entry.userId, prevRank);
    });
  }

  let currentRank = 1;
  return sorted.map((entry, index) => {
    if (index > 0 && entry.points < sorted[index - 1].points) currentRank = index + 1;

    const oldRank = previousRankMap.get(entry.userId) ?? null;
    let movement: 'up' | 'down' | 'same' | 'new' = 'new';
    let movementAmount = 0;

    if (oldRank !== null) {
      if (oldRank > currentRank) {
        movement = 'up';
        movementAmount = oldRank - currentRank;
      } else if (oldRank < currentRank) {
        movement = 'down';
        movementAmount = currentRank - oldRank;
      } else {
        movement = 'same';
      }
    }

    return {
      rank: currentRank,
      oldRank,
      movement,
      movementAmount,
      userId: entry.userId,
      firstName: entry.user.firstName,
      lastName: entry.user.lastName,
      username: entry.user.username,
      points: entry.points,
      teamValue: entry.teamValue,
      eventsPlayed: entry.events,
    };
  });
}

// ────────────────────────────────────────────────────────────
// Label helpers
// ────────────────────────────────────────────────────────────

export function formatWeekLabel(start: Date, end: Date, gameweek?: number): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const dateRange = `${start.toLocaleDateString('en-GB', options)} - ${end.toLocaleDateString('en-GB', options)}`;
  return gameweek && gameweek > 0 ? `Gameweek ${gameweek}: ${dateRange}` : dateRange;
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
