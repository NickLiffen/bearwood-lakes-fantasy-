// POST /.netlify/functions/tournaments-create

import { createTournament } from './_shared/services/tournaments.service';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, startDate, endDate, tournamentType, playerCountTier, season } = body;

    if (!name || !startDate || !endDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'name, startDate, and endDate are required',
        }),
      };
    }

    const tournament = await createTournament({
      name,
      startDate,
      endDate,
      tournamentType: tournamentType || 'regular',
      playerCountTier: playerCountTier || '20+',
      season,
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        data: tournament,
        message: 'Tournament created successfully',
      }),
    };
  } catch (error) {
    console.error('Error creating tournament:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Failed to create tournament',
      }),
    };
  }
});

export { handler };
