// GET /.netlify/functions/seasons-list

import type { Handler } from '@netlify/functions';
import { withAuth } from './_shared/middleware';
import { getAllSeasons } from './_shared/services/seasons.service';

export const handler: Handler = withAuth(async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const seasons = await getAllSeasons();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: seasons }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch seasons';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
