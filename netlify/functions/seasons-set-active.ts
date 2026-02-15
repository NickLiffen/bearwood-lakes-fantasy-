// POST /.netlify/functions/seasons-set-active

import { setActiveSeason } from './_shared/services/seasons.service';
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
    const { id } = body;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Season id is required' }),
      };
    }

    const season = await setActiveSeason(id);

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
        message: 'Active season updated successfully',
      }),
    };
  } catch (error) {
    console.error('Error setting active season:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set active season',
      }),
    };
  }
});

export { handler };
