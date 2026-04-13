// Team service — composable functions for my-team handler

import { ObjectId, type Db } from 'mongodb';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from '../models/Golfer';
import { ScoreDocument } from '../models/Score';
import { TournamentDocument } from '../models/Tournament';
import { PickHistoryDocument, PICK_HISTORY_COLLECTION } from '../models/Pick';
import { getWeekStart, getMonthStart, getMonthEnd, getFirstGameweekStart, getGameweekNumber } from '../utils/dates';
import { calculateGolferContribution, getRosterForGameweek, type TimeBoundaries, type RosterSnapshot } from '../utils/scoring';
import type { TournamentType, ScoringFormat } from '@shared/types';

export interface TournamentScoreInfo {
  tournamentId: string;
  tournamentName: string;
  tournamentType: TournamentType;
  scoringFormat: ScoringFormat;
  multiplier: number;
  position: number | null;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
  rawScore: number | null;
  participated: boolean;
  tournamentDate: Date;
}

export interface GolferWithScores {
  golfer: ReturnType<typeof toGolfer>;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekScores: TournamentScoreInfo[];
  seasonScores: TournamentScoreInfo[];
  isCaptain: boolean;
}

/**
 * Compute per-golfer scores with week/month/season breakdowns.
 * Pure computation over pre-fetched data — no DB calls.
 *
 * When `gameweekRosters` is provided, uses per-gameweek roster lookup for
 * correct captain assignment and roster membership filtering.
 */
export function getTeamGolferScores(
  golfers: GolferDocument[],
  publishedTournaments: TournamentDocument[],
  scores: ScoreDocument[],
  seasonStartDate: Date | null,
  captainId: string | null | undefined,
  selectedWeekStart: Date,
  selectedWeekEnd: Date,
  teamEffectiveStart: Date,
  firstGameweekStart?: Date | null,
  gameweekRosters?: Record<string, RosterSnapshot> | null
): GolferWithScores[] {
  const tournamentMap = new Map(publishedTournaments.map((t) => [t._id.toString(), t]));

  // Build golfer scores map and tournament date lookup
  const golferScoresMap = new Map<string, ScoreDocument[]>();
  for (const score of scores) {
    const golferId = score.golferId.toString();
    if (!golferScoresMap.has(golferId)) {
      golferScoresMap.set(golferId, []);
    }
    golferScoresMap.get(golferId)!.push(score);
  }

  const tournamentDates = new Map<string, Date>();
  for (const t of publishedTournaments) {
    tournamentDates.set(t._id.toString(), new Date(t.startDate));
  }

  // Season's first gameweek
  const seasonFirstSat = seasonStartDate
    ? getFirstGameweekStart(new Date(seasonStartDate), firstGameweekStart)
    : getWeekStart(new Date(), firstGameweekStart);

  // Build time boundaries for shared scorer
  const monthStart = getMonthStart(selectedWeekStart);
  const monthEnd = getMonthEnd(selectedWeekStart);
  const boundaries: TimeBoundaries = {
    weekStart: selectedWeekStart,
    weekEnd: selectedWeekEnd,
    monthStart,
    monthEnd,
    seasonStart: seasonFirstSat,
  };

  const captainIdString = captainId?.toString();
  const hasRosters = gameweekRosters && Object.keys(gameweekRosters).length > 0;

  const golfersWithScores: GolferWithScores[] = golfers.map((golfer) => {
    const golferIdStr = golfer._id.toString();
    const golferScores = golferScoresMap.get(golferIdStr) || [];

    // Determine captain status — use per-gameweek roster for the selected week if available
    let isCaptain: boolean;
    if (hasRosters) {
      const selectedGW = getGameweekNumber(
        selectedWeekStart,
        seasonStartDate || seasonFirstSat,
        firstGameweekStart
      );
      const roster = getRosterForGameweek(gameweekRosters!, selectedGW);
      isCaptain = roster ? golferIdStr === roster.captainId : golferIdStr === captainIdString;
    } else {
      isCaptain = golferIdStr === captainIdString;
    }

    // Format scores with tournament info (for detailed display)
    const formattedScores: TournamentScoreInfo[] = golferScores
      .map((score) => {
        const tournament = tournamentMap.get(score.tournamentId.toString());
        return {
          tournamentId: score.tournamentId.toString(),
          tournamentName: tournament?.name || 'Unknown Tournament',
          tournamentType: (tournament?.tournamentType || 'rollup_stableford') as TournamentType,
          scoringFormat: (tournament?.scoringFormat || 'stableford') as ScoringFormat,
          multiplier: tournament?.multiplier ?? 1,
          position: score.position,
          basePoints: score.basePoints,
          bonusPoints: score.bonusPoints,
          multipliedPoints: score.multipliedPoints,
          rawScore: score.rawScore,
          participated: score.participated,
          tournamentDate: tournament?.startDate || new Date(),
        };
      })
      .sort((a, b) => new Date(b.tournamentDate).getTime() - new Date(a.tournamentDate).getTime());

    // Filter by time period for display lists — also check roster membership when available
    const weekScores = formattedScores.filter((s) => {
      const date = new Date(s.tournamentDate);
      if (date < selectedWeekStart || date > selectedWeekEnd || date < teamEffectiveStart)
        return false;
      if (hasRosters) {
        const gw = getGameweekNumber(
          getWeekStart(date, firstGameweekStart),
          seasonStartDate || seasonFirstSat,
          firstGameweekStart
        );
        const roster = getRosterForGameweek(gameweekRosters!, gw);
        if (!roster || !roster.golferIds.includes(golferIdStr)) return false;
      }
      return true;
    });

    const seasonScores = formattedScores.filter((s) => {
      const date = new Date(s.tournamentDate);
      if (date < seasonFirstSat || date < teamEffectiveStart) return false;
      if (hasRosters) {
        const gw = getGameweekNumber(
          getWeekStart(date, firstGameweekStart),
          seasonStartDate || seasonFirstSat,
          firstGameweekStart
        );
        const roster = getRosterForGameweek(gameweekRosters!, gw);
        if (!roster || !roster.golferIds.includes(golferIdStr)) return false;
      }
      return true;
    });

    // Calculate totals using shared scorer (captain multiplier + boundaries + roster awareness)
    const { weekPoints, monthPoints, seasonPoints } = calculateGolferContribution(
      golferScores,
      tournamentDates,
      boundaries,
      isCaptain,
      teamEffectiveStart,
      gameweekRosters,
      golferIdStr,
      firstGameweekStart,
      seasonStartDate
    );

    return {
      golfer: toGolfer(golfer),
      weekPoints,
      monthPoints,
      seasonPoints,
      weekScores,
      seasonScores,
      isCaptain,
    };
  });

  // Sort by week points descending
  golfersWithScores.sort((a, b) => b.weekPoints - a.weekPoints);

  return golfersWithScores;
}

export interface TransferHistoryEntry {
  changedAt: Date;
  reason: string;
  totalSpent: number;
  golferCount: number;
  addedGolfers: Array<{ id: string; name: string }>;
  removedGolfers: Array<{ id: string; name: string }>;
}

/**
 * Fetch and format transfer history for a user in a given season.
 */
export async function getTeamTransferHistory(
  db: Db,
  userId: string,
  season: number
): Promise<TransferHistoryEntry[]> {
  const userObjectId = new ObjectId(userId);

  const pickHistory = await db
    .collection<PickHistoryDocument>(PICK_HISTORY_COLLECTION)
    .find({ userId: userObjectId, season })
    .sort({ changedAt: -1 })
    .toArray();

  const allHistoryGolferIds = new Set<string>();
  for (const h of pickHistory) {
    for (const gid of h.golferIds) {
      allHistoryGolferIds.add(gid.toString());
    }
  }

  const historyGolfers = await db
    .collection<GolferDocument>(GOLFERS_COLLECTION)
    .find({
      _id: {
        $in: Array.from(allHistoryGolferIds).map((id) => new ObjectId(id)),
      },
    })
    .project({ _id: 1, firstName: 1, lastName: 1 })
    .toArray();

  const historyGolferMap = new Map(historyGolfers.map((g) => [g._id.toString(), g]));

  const formattedHistory = pickHistory.map((h, index) => {
    const previousHistory = pickHistory[index + 1];
    const previousGolferIds = previousHistory
      ? new Set(previousHistory.golferIds.map((id) => id.toString()))
      : new Set<string>();
    const currentGolferIds = new Set(h.golferIds.map((id) => id.toString()));

    const addedGolfers: Array<{ id: string; name: string }> = [];
    const removedGolfers: Array<{ id: string; name: string }> = [];

    for (const pid of currentGolferIds) {
      if (!previousGolferIds.has(pid)) {
        const golfer = historyGolferMap.get(pid);
        if (golfer)
          addedGolfers.push({
            id: pid,
            name: `${golfer.firstName} ${golfer.lastName}`,
          });
      }
    }
    if (previousHistory) {
      for (const pid of previousGolferIds) {
        if (!currentGolferIds.has(pid)) {
          const golfer = historyGolferMap.get(pid);
          if (golfer)
            removedGolfers.push({
              id: pid,
              name: `${golfer.firstName} ${golfer.lastName}`,
            });
        }
      }
    }

    return {
      changedAt: h.changedAt,
      reason: h.reason,
      totalSpent: h.totalSpent,
      golferCount: h.golferIds.length,
      addedGolfers,
      removedGolfers,
    };
  });

  return formattedHistory.filter((h) => h.addedGolfers.length > 0 || h.removedGolfers.length > 0);
}
