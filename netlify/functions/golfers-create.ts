// POST /.netlify/functions/golfers-create (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { createGolfer } from './_shared/services/golfers.service';
import type { CreateGolferDTO } from '../../shared/types';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data: CreateGolferDTO = JSON.parse(event.body || '{}');
    const golfer = await createGolfer(data);

    return {
      statusCode: 201,
      body: JSON.stringify({ success: true, data: golfer }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create golfer';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
