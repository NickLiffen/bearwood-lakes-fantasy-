// POST /.netlify/functions/players-create (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { createPlayer } from './_shared/services/players.service';
import type { CreatePlayerDTO } from '../../shared/types';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data: CreatePlayerDTO = JSON.parse(event.body || '{}');
    const player = await createPlayer(data);

    return {
      statusCode: 201,
      body: JSON.stringify({ success: true, data: player }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create player';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
