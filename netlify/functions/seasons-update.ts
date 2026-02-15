// PUT /.netlify/functions/seasons-update

import { updateSeason } from './_shared/services/seasons.service';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Season id is required' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { name, startDate, endDate, isActive, status } = body;

    const season = await updateSeason(id, { name, startDate, endDate, isActive, status });

    if (!season) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Season not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: season,
        message: 'Season updated successfully',
      }),
    };
  } catch (error) {
    console.error('Error updating season:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update season',
      }),
    };
  }
});

export { handler };
