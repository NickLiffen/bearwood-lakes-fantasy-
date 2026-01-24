// GET /.netlify/functions/players-list

import { withAuth } from './_shared/middleware';
import { getAllPlayers } from './_shared/services/players.service';

export const handler = withAuth(async () => {
  try {
    const players = await getAllPlayers();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: players }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch players';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
