// GET /.netlify/functions/my-team
// GET /.netlify/functions/my-team?date=YYYY-MM-DD
// Returns user's team with detailed stats including week and season breakdowns

import type { Handler } from '@netlify/functions';
import { ObjectId } from 'mongodb';
import { withVerifiedAuth, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { GolferDocument, GOLFERS_COLLECTION } from './_shared/models/Golfer';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from './_shared/models/Settings';
import {
  getWeekStart,
  getWeekEnd,
  getTeamEffectiveStartDate,
  getGameweekNumber,
  getFirstGameweekStart,
  hasUnlimitedTransfers,
} from './_shared/utils/dates';
import { getTransfersThisWeek, applyPendingChanges } from './_shared/services/picks.service';
import { getActiveSeason } from './_shared/services/seasons.service';
import { getTeamGolferScores, getTeamTransferHistory } from './_shared/services/team.service';

/**
 * Format week label like "Jan 4 - Jan 10"
 */
function formatWeekLabel(
  weekStart: Date,
  gameweek?: number | null,
  firstGameweekStart?: Date | null
): string {
  const weekEnd = getWeekEnd(weekStart, firstGameweekStart);

  const startMonth = weekStart.toLocaleDateString('en-US', { month: 'short' });
  const startDay = weekStart.getDate();
  const endMonth = weekEnd.toLocaleDateString('en-US', { month: 'short' });
  const endDay = weekEnd.getDate();

  const dateRange =
    startMonth === endMonth
      ? `${startMonth} ${startDay} - ${endDay}`
      : `${startMonth} ${startDay} - ${endMonth} ${endDay}`;

  if (gameweek && gameweek > 0) {
    return `Gameweek ${gameweek}: ${dateRange}`;
  }
  return dateRange;
}

export const handler: Handler = withVerifiedAuth(async (event: AuthenticatedEvent) => {
  try {
    const { db } = await connectToDatabase();

    // Parse date parameter - if not provided, use current date
    const dateParam = event.queryStringParameters?.date;
    let targetDate = dateParam ? new Date(dateParam) : new Date();

    // Validate date if provided
    if (dateParam && isNaN(targetDate.getTime())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Invalid date format. Use YYYY-MM-DD.' }),
      };
    }

    // Get active season and parallelize settings queries
    const [activeSeason, transfersSetting, newTeamSetting, maxTransfersSetting] = await Promise.all(
      [
        getActiveSeason(),
        db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'transfersOpen' }),
        db
          .collection<SettingDocument>(SETTINGS_COLLECTION)
          .findOne({ key: 'allowNewTeamCreation' }),
        db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'maxTransfersPerWeek' }),
      ]
    );

    const currentSeason = activeSeason
      ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
      : new Date().getFullYear();
    const firstGW = activeSeason?.firstGameweekStart
      ? new Date(activeSeason.firstGameweekStart)
      : null;

    // If season hasn't started yet and no specific date requested, default to GW1
    if (!dateParam && activeSeason) {
      const seasonFirstGW = getFirstGameweekStart(new Date(activeSeason.startDate), firstGW);
      if (new Date() < seasonFirstGW) {
        targetDate = seasonFirstGW;
      }
    }

    const transfersOpen = (transfersSetting?.value as boolean) || false;
    const allowNewTeamCreation = (newTeamSetting?.value as boolean) ?? true;
    const maxTransfersPerWeek = (maxTransfersSetting?.value as number) || 1;

    // Get transfer count for this user this week
    const transfersUsedThisWeek = await getTransfersThisWeek(event.user.userId);

    // Apply any pending changes from previous gameweeks
    await applyPendingChanges(event.user.userId);

    // Get user's picks for current season (re-read after potential apply)
    const pick = await db.collection<PickDocument>(PICKS_COLLECTION).findOne({
      userId: new ObjectId(event.user.userId),
      season: currentSeason,
    });

    // Check if unlimited transfers apply (pre-season, before GW1, or pre-first-game-week for new teams)
    const now = new Date();
    const seasonStartDate = activeSeason?.startDate ? new Date(activeSeason.startDate) : null;
    const unlimitedTransfers = hasUnlimitedTransfers(
      seasonStartDate,
      firstGW,
      pick?.createdAt,
      now
    );

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
            unlimitedTransfers: hasUnlimitedTransfers(seasonStartDate, firstGW, undefined, now),
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
        season: currentSeason,
      })
      .toArray();

    const publishedTournamentIds = publishedTournaments.map((t) => t._id);

    // Get all scores for these golfers from published tournaments
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({
        golferId: { $in: golferIds },
        tournamentId: { $in: publishedTournamentIds },
      })
      .toArray();

    // Time boundaries
    const currentWeekStart = getWeekStart(now, firstGW);
    const currentWeekEnd = getWeekEnd(currentWeekStart, firstGW);

    // Season's first gameweek
    const seasonFirstSat = activeSeason?.startDate
      ? getFirstGameweekStart(new Date(activeSeason.startDate), firstGW)
      : getWeekStart(new Date(), firstGW);

    // Selected week boundaries (based on date param or current)
    const selectedWeekStart = getWeekStart(targetDate, firstGW);
    const selectedWeekEnd = getWeekEnd(selectedWeekStart, firstGW);

    // Team effective start date
    const teamEffectiveStartDate = getTeamEffectiveStartDate(pick.createdAt, firstGW);

    // Navigation constraints — can't go before season's first Saturday
    const previousWeekStart = new Date(selectedWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    const earliestWeek =
      teamEffectiveStartDate > seasonFirstSat ? teamEffectiveStartDate : seasonFirstSat;
    const hasPrevious = previousWeekStart >= earliestWeek;

    // Can go forward if we're not already on or past the current week
    const hasNext = selectedWeekEnd < currentWeekEnd;

    // Compute golfer scores and fetch transfer history in parallel
    const [golfersWithScores, filteredHistory] = await Promise.all([
      Promise.resolve(
        getTeamGolferScores(
          golfers,
          publishedTournaments,
          scores,
          activeSeason?.startDate ? new Date(activeSeason.startDate) : null,
          pick.captainId?.toString(),
          selectedWeekStart,
          selectedWeekEnd,
          teamEffectiveStartDate,
          firstGW
        )
      ),
      getTeamTransferHistory(db, event.user.userId, currentSeason),
    ]);

    // Calculate team totals
    const teamTotals = {
      weekPoints: golfersWithScores.reduce((sum, g) => sum + g.weekPoints, 0),
      monthPoints: golfersWithScores.reduce((sum, g) => sum + g.monthPoints, 0),
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
          unlimitedTransfers,
          team: {
            golfers: golfersWithScores,
            totals: teamTotals,
            captainId: pick.captainId?.toString() || null,
            period: {
              weekStart: selectedWeekStart.toISOString(),
              weekEnd: selectedWeekEnd.toISOString(),
              label: formatWeekLabel(
                selectedWeekStart,
                activeSeason
                  ? getGameweekNumber(selectedWeekStart, new Date(activeSeason.startDate), firstGW)
                  : null,
                firstGW
              ),
              gameweek: activeSeason
                ? getGameweekNumber(selectedWeekStart, new Date(activeSeason.startDate), firstGW)
                : null,
              hasPrevious,
              hasNext,
            },
            seasonStart: seasonFirstSat.toISOString(),
            teamEffectiveStart: teamEffectiveStartDate.toISOString(),
            createdAt: pick.createdAt,
            updatedAt: pick.updatedAt,
          },
          history: filteredHistory,
          pendingChanges:
            pick.pendingGolferIds || pick.pendingCaptainId !== undefined
              ? {
                  pendingGolferIds: pick.pendingGolferIds?.map((id) => id.toString()) || null,
                  pendingCaptainId: pick.pendingCaptainId?.toString() || null,
                  pendingChangedAt: pick.pendingChangedAt || null,
                }
              : null,
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
