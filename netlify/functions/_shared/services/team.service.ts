// Team service — composable functions for my-team handler

import { ObjectId, type Db } from 'mongodb';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from '../models/Golfer';
import { ScoreDocument } from '../models/Score';
import { TournamentDocument } from '../models/Tournament';
import { PickDocument } from '../models/Pick';
import { PickHistoryDocument, PICK_HISTORY_COLLECTION } from '../models/Pick';
import {
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getTeamEffectiveStartDate,
  getSeasonFirstSaturday,
} from '../utils/dates';

export interface TournamentScoreInfo {
  tournamentId: string;
  tournamentName: string;
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
): GolferWithScores[] {
  const tournamentMap = new Map(
    publishedTournaments.map((t) => [t._id.toString(), t]),
  );

  // Build golfer scores map
  const golferScoresMap = new Map<string, ScoreDocument[]>();
  for (const score of scores) {
    const golferId = score.golferId.toString();
    if (!golferScoresMap.has(golferId)) {
      golferScoresMap.set(golferId, []);
    }
    golferScoresMap.get(golferId)!.push(score);
  }

  // Season's first gameweek (first Saturday of the season)
  const seasonFirstSat = seasonStartDate
    ? getSeasonFirstSaturday(new Date(seasonStartDate))
    : getWeekStart(new Date());

  const captainIdString = captainId?.toString();

  const golfersWithScores: GolferWithScores[] = golfers.map((golfer) => {
    const golferScores = golferScoresMap.get(golfer._id.toString()) || [];
    const isCaptain = golfer._id.toString() === captainIdString;
    const captainMultiplier = isCaptain ? 2 : 1;

    // Format scores with tournament info
    const formattedScores: TournamentScoreInfo[] = golferScores
      .map((score) => {
        const tournament = tournamentMap.get(score.tournamentId.toString());
        return {
          tournamentId: score.tournamentId.toString(),
          tournamentName: tournament?.name || 'Unknown Tournament',
          position: score.position,
          basePoints: score.basePoints,
          bonusPoints: score.bonusPoints,
          multipliedPoints: score.multipliedPoints,
          rawScore: score.rawScore,
          participated: score.participated,
          tournamentDate: tournament?.startDate || new Date(),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.tournamentDate).getTime() -
          new Date(a.tournamentDate).getTime(),
      );

    // Filter by time period — must be within period AND after team's effective start date
    const weekScores = formattedScores.filter((s) => {
      const date = new Date(s.tournamentDate);
      return (
        date >= selectedWeekStart &&
        date <= selectedWeekEnd &&
        date >= teamEffectiveStart
      );
    });

    const seasonScores = formattedScores.filter((s) => {
      const date = new Date(s.tournamentDate);
      return date >= seasonFirstSat && date >= teamEffectiveStart;
    });

    // Month scores — current month of the selected week
    const monthStart = getMonthStart(selectedWeekStart);
    const monthEnd = getMonthEnd(selectedWeekStart);
    const monthScores = formattedScores.filter((s) => {
      const date = new Date(s.tournamentDate);
      return (
        date >= monthStart && date <= monthEnd && date >= teamEffectiveStart
      );
    });

    // Calculate totals with captain multiplier
    const weekPoints =
      weekScores.reduce((sum, s) => sum + s.multipliedPoints, 0) *
      captainMultiplier;
    const monthPoints =
      monthScores.reduce((sum, s) => sum + s.multipliedPoints, 0) *
      captainMultiplier;
    const seasonPoints =
      seasonScores.reduce((sum, s) => sum + s.multipliedPoints, 0) *
      captainMultiplier;

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
  season: number,
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

  const historyGolferMap = new Map(
    historyGolfers.map((g) => [g._id.toString(), g]),
  );

  const formattedHistory = pickHistory.map((h, index) => {
    const previousHistory = pickHistory[index + 1];
    const previousGolferIds = previousHistory
      ? new Set(previousHistory.golferIds.map((id) => id.toString()))
      : new Set<string>();
    const currentGolferIds = new Set(
      h.golferIds.map((id) => id.toString()),
    );

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

  return formattedHistory.filter(
    (h) => h.addedGolfers.length > 0 || h.removedGolfers.length > 0,
  );
}
