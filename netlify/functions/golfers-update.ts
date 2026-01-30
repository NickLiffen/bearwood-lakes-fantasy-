// PUT /.netlify/functions/golfers-update (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { updateGolfer } from './_shared/services/golfers.service';
import type { UpdateGolferDTO } from '../../shared/types';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { id, ...data }: { id: string } & UpdateGolferDTO = JSON.parse(event.body || '{}');

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Golfer ID is required' }),
      };
    }

    const golfer = await updateGolfer(id, data);

    if (!golfer) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Golfer not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: golfer }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update golfer';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
