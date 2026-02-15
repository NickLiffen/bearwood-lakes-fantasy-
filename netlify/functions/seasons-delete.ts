// DELETE /.netlify/functions/seasons-delete

import { deleteSeason } from './_shared/services/seasons.service';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'DELETE') {
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

    const deleted = await deleteSeason(id);

    if (!deleted) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Season not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Season deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Delete season error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete season';
    const statusCode = message === 'Cannot delete the active season' ? 400 : 500;
    return {
      statusCode,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});

export { handler };
