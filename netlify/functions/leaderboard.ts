// GET /.netlify/functions/leaderboard

import type { Handler } from '@netlify/functions';
import { withAuth } from './_shared/middleware';
import { getLeaderboard, getWeeklyLeaderboard } from './_shared/services/leaderboard.service';

export const handler: Handler = withAuth(async (event) => {
  try {
    const week = event.queryStringParameters?.week;

    const leaderboard = week
      ? await getWeeklyLeaderboard(parseInt(week, 10))
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
