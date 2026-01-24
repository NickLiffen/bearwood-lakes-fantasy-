// GET /.netlify/functions/scores-list

import type { Handler } from '@netlify/functions';
import { withAuth } from './_shared/middleware';
import { getScoresForWeek, getAllScores } from './_shared/services/scores.service';

export const handler: Handler = withAuth(async (event) => {
  try {
    const week = event.queryStringParameters?.week;

    const scores = week ? await getScoresForWeek(parseInt(week, 10)) : await getAllScores();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: scores }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch scores';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
