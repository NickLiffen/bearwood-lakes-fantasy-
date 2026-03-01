// Health check endpoint — verifies database connectivity
// No auth required, rate-limited as a read endpoint

import type { Handler } from '@netlify/functions';
import { connectToDatabase } from './_shared/db';
import { withRateLimit } from './_shared/middleware';

const healthHandler: Handler = async () => {
  try {
    const { db } = await connectToDatabase();
    const golferCount = await db.collection('golfers').countDocuments();
    const tournamentCount = await db.collection('tournaments').countDocuments();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ok',
        database: 'connected',
        golfers: golferCount,
        tournaments: tournamentCount,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

export const handler = withRateLimit(healthHandler, 'read');
