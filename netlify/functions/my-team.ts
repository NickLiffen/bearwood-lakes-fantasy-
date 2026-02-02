// GET /.netlify/functions/my-team
// GET /.netlify/functions/my-team?date=YYYY-MM-DD
// Returns user's team with detailed stats including week and season breakdowns

import type { Handler } from '@netlify/functions';
import { ObjectId } from 'mongodb';
import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from './_shared/models/Golfer';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from './_shared/models/Settings';
import { getWeekStart, getWeekEnd, getSeasonStart, getTeamEffectiveStartDate } from './_shared/utils/dates';
import { getTransfersThisWeek } from './_shared/services/picks.service';

interface TournamentScoreInfo {
  tournamentId: string;
  tournamentName: string;
  position: number | null;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
  scored36Plus: boolean;
  participated: boolean;
  tournamentDate: Date;
}

interface GolferWithScores {
  golfer: ReturnType<typeof toGolfer>;
  weekPoints: number;
  seasonPoints: number;
  weekScores: TournamentScoreInfo[];
  seasonScores: TournamentScoreInfo[];
  isCaptain: boolean;
}

/**
 * Format week label like "Jan 4 - Jan 10"
 */
function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Friday (6 days after Saturday)

  const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' });
  const startDay = weekStart.getDate();
  const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
  const endDay = weekEnd.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

export const handler: Handler = withAuth(async (event: AuthenticatedEvent) => {
  try {
    const { db } = await connectToDatabase();

    // Parse date parameter - if not provided, use current date
    const dateParam = event.queryStringParameters?.date;
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    // Validate date if provided
    if (dateParam && isNaN(targetDate.getTime())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Invalid date format. Use YYYY-MM-DD.' }),
      };
    }

    // Parallelize all settings queries for faster response
    const [seasonSetting, transfersSetting, newTeamSetting, maxTransfersSetting] = await Promise.all([
      db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'currentSeason' }),
      db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'transfersOpen' }),
      db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'allowNewTeamCreation' }),
      db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'maxTransfersPerWeek' }),
    ]);

    const currentSeason = (seasonSetting?.value as number) || 2026;
    const transfersOpen = (transfersSetting?.value as boolean) || false;
    const allowNewTeamCreation = (newTeamSetting?.value as boolean) ?? true;
    const maxTransfersPerWeek = (maxTransfersSetting?.value as number) || 1;

    // Get transfer count for this user this week
    const transfersUsedThisWeek = await getTransfersThisWeek(event.user.userId);

    // Get user's picks for current season
    const pick = await db
      .collection<PickDocument>(PICKS_COLLECTION)
      .findOne({
        userId: new ObjectId(event.user.userId),
        season: currentSeason,
      });

    if (!pick) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          data: {
            hasTeam: false,
            transfersOpen,
            allowNewTeamCreation,
            maxTransfersPerWeek,
            transfersUsedThisWeek: 0,
            team: null,
          },
        }),
      };
    }

    // Get golfers for this pick
    const golferIds = pick.golferIds.map((id) => new ObjectId(id));
    const golfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: golferIds } })
      .toArray();

    // Get published or complete tournaments for current season
    const publishedTournaments = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({
        status: { $in: ['published', 'complete'] },
        season: currentSeason
      })
      .toArray();

    const tournamentMap = new Map(
      publishedTournaments.map((t) => [t._id.toString(), t])
    );
    const publishedTournamentIds = publishedTournaments.map((t) => t._id);

    // Get all scores for these golfers from published tournaments
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({
        golferId: { $in: golferIds },
        tournamentId: { $in: publishedTournamentIds },
      })
      .toArray();

    // Build golfer scores map
    const golferScoresMap = new Map<string, ScoreDocument[]>();
    for (const score of scores) {
      const golferId = score.golferId.toString();
      if (!golferScoresMap.has(golferId)) {
        golferScoresMap.set(golferId, []);
      }
      golferScoresMap.get(golferId)!.push(score);
    }

    // Time boundaries
    const now = new Date();
    const currentWeekStart = getWeekStart(now);
    const currentWeekEnd = getWeekEnd(currentWeekStart);
    const seasonStart = getSeasonStart();

    // Selected week boundaries (based on date param or current)
    const selectedWeekStart = getWeekStart(targetDate);
    const selectedWeekEnd = getWeekEnd(selectedWeekStart);

    // Team effective start date - teams only earn points from tournaments
    // starting on or after the next Saturday 8am from when they were created
    const teamEffectiveStart = getTeamEffectiveStartDate(pick.createdAt);

    // Navigation constraints
    // Can go back if previous week is >= team effective start AND >= season start
    const previousWeekStart = new Date(selectedWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    const earliestWeek = teamEffectiveStart > seasonStart ? teamEffectiveStart : seasonStart;
    const hasPrevious = previousWeekStart >= earliestWeek;

    // Can go forward if we're not already on or past the current week
    const hasNext = selectedWeekEnd < currentWeekEnd;

    // Build golfer data with scores
    const captainIdString = pick.captainId?.toString();
    const golfersWithScores: GolferWithScores[] = golfers.map((golfer) => {
      const golferScores = golferScoresMap.get(golfer._id.toString()) || [];
      const isCaptain = golfer._id.toString() === captainIdString;
      const captainMultiplier = isCaptain ? 2 : 1;

      // Format scores with tournament info
      const formattedScores: TournamentScoreInfo[] = golferScores.map((score) => {
        const tournament = tournamentMap.get(score.tournamentId.toString());
        return {
          tournamentId: score.tournamentId.toString(),
          tournamentName: tournament?.name || 'Unknown Tournament',
          position: score.position,
          basePoints: score.basePoints,
          bonusPoints: score.bonusPoints,
          multipliedPoints: score.multipliedPoints,
          scored36Plus: score.scored36Plus,
          participated: score.participated,
          tournamentDate: tournament?.startDate || new Date(),
        };
      }).sort((a, b) => new Date(b.tournamentDate).getTime() - new Date(a.tournamentDate).getTime());

      // Filter by time period - must be within period AND after team's effective start date
      const weekScores = formattedScores.filter((s) => {
        const date = new Date(s.tournamentDate);
        return date >= selectedWeekStart && date <= selectedWeekEnd && date >= teamEffectiveStart;
      });

      const seasonScores = formattedScores.filter((s) => {
        const date = new Date(s.tournamentDate);
        return date >= seasonStart && date >= teamEffectiveStart;
      });

      // Calculate totals with captain multiplier
      const weekPoints = weekScores.reduce((sum, s) => sum + s.multipliedPoints, 0) * captainMultiplier;
      const seasonPoints = seasonScores.reduce((sum, s) => sum + s.multipliedPoints, 0) * captainMultiplier;

      return {
        golfer: toGolfer(golfer),
        weekPoints,
        seasonPoints,
        weekScores,
        seasonScores,
        isCaptain,
      };
    });

    // Sort by week points descending for the selected week
    golfersWithScores.sort((a, b) => b.weekPoints - a.weekPoints);

    // Calculate team totals
    const teamTotals = {
      weekPoints: golfersWithScores.reduce((sum, g) => sum + g.weekPoints, 0),
      seasonPoints: golfersWithScores.reduce((sum, g) => sum + g.seasonPoints, 0),
      totalSpent: pick.totalSpent,
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          hasTeam: true,
          transfersOpen,
          allowNewTeamCreation,
          maxTransfersPerWeek,
          transfersUsedThisWeek,
          team: {
            golfers: golfersWithScores,
            totals: teamTotals,
            captainId: pick.captainId?.toString() || null,
            period: {
              weekStart: selectedWeekStart.toISOString(),
              weekEnd: selectedWeekEnd.toISOString(),
              label: formatWeekLabel(selectedWeekStart),
              hasPrevious,
              hasNext,
            },
            seasonStart: seasonStart.toISOString(),
            teamEffectiveStart: teamEffectiveStart.toISOString(),
            createdAt: pick.createdAt,
            updatedAt: pick.updatedAt,
          },
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch team';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
