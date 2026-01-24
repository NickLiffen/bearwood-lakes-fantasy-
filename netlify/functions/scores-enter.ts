// POST /.netlify/functions/scores-enter (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { enterScore } from './_shared/services/scores.service';
import type { EnterScoreRequest } from '../../shared/types';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data: EnterScoreRequest = JSON.parse(event.body || '{}');

    if (!data.playerId || data.week === undefined || data.points === undefined) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'playerId, week, and points are required' }),
      };
    }

    const score = await enterScore(data);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: score }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enter score';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
