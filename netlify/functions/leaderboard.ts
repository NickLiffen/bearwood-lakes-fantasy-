// GET /.netlify/functions/leaderboard

import { withAuth } from './_shared/middleware';
import { getLeaderboard, getTournamentLeaderboard } from './_shared/services/leaderboard.service';

export const handler = withAuth(async (event) => {
  try {
    const tournamentId = event.queryStringParameters?.tournamentId;

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
