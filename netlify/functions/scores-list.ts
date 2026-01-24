// GET /.netlify/functions/scores-list

import type { Handler } from '@netlify/functions';
import { withAuth } from './_shared/middleware';
import {
  getScoresForTournament,
  getAllScores,
  getPublishedScores,
} from './_shared/services/scores.service';

export const handler: Handler = withAuth(async (event) => {
  try {
    const tournamentId = event.queryStringParameters?.tournamentId;
    const publishedOnly = event.queryStringParameters?.publishedOnly === 'true';

    let scores;
    if (tournamentId) {
      scores = await getScoresForTournament(tournamentId);
    } else if (publishedOnly) {
      scores = await getPublishedScores();
    } else {
      scores = await getAllScores();
    }

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
