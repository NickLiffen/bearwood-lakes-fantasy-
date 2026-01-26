// GET /.netlify/functions/leaderboard
// Returns leaderboard data with season, monthly, and weekly rankings

import { withAuth } from './_shared/middleware';
import { getFullLeaderboard, getLeaderboard, getTournamentLeaderboard } from './_shared/services/leaderboard.service';

export const handler = withAuth(async (event) => {
  try {
    const tournamentId = event.queryStringParameters?.tournamentId;
    const view = event.queryStringParameters?.view; // 'full' for season/month/week breakdown

    // If requesting full leaderboard breakdown
    if (view === 'full') {
      const leaderboard = await getFullLeaderboard();
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: leaderboard }),
      };
    }

    // Otherwise use the existing simple leaderboard
    const leaderboard = tournamentId
      ? await getTournamentLeaderboard(tournamentId)
      : await getLeaderboard();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: leaderboard }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch leaderboard';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
