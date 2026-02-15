// POST /.netlify/functions/seasons-create

import { createSeason } from './_shared/services/seasons.service';
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
    const { name, startDate, endDate, isActive, status } = body;

    if (!name || !startDate || !endDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'name, startDate, and endDate are required',
        }),
      };
    }

    const season = await createSeason({ name, startDate, endDate, isActive, status });

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        data: season,
        message: 'Season created successfully',
      }),
    };
  } catch (error) {
    console.error('Error creating season:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create season',
      }),
    };
  }
});

export { handler };
