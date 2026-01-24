// PUT /.netlify/functions/players-update (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { updatePlayer } from './_shared/services/players.service';
import type { UpdatePlayerDTO } from '../../shared/types';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { id, ...data }: { id: string } & UpdatePlayerDTO = JSON.parse(event.body || '{}');

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Player ID is required' }),
      };
    }

    const player = await updatePlayer(id, data);

    if (!player) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Player not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: player }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update player';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
