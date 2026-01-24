// GET /.netlify/functions/tournaments-list

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getAllTournaments, getTournamentsByStatus } from './_shared/services/tournaments.service';
import { verifyToken } from './_shared/auth';

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    // Optional auth - admins can see draft tournaments
    let isAdmin = false;
    const authHeader = event.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = verifyToken(token);
        isAdmin = decoded?.role === 'admin';
      } catch {
        // Invalid token, continue as non-admin
      }
    }

    // Admins see all tournaments, others see only published/complete
    let tournaments;
    if (isAdmin) {
      tournaments = await getAllTournaments();
    } else {
      const published = await getTournamentsByStatus('published');
      const complete = await getTournamentsByStatus('complete');
      tournaments = [...published, ...complete].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: tournaments,
      }),
    };
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch tournaments',
      }),
    };
  }
};

export { handler };
