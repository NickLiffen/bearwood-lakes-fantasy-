// DELETE /.netlify/functions/golfers-delete (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { deleteGolfer } from './_shared/services/golfers.service';
import { deleteScoresForGolfer } from './_shared/services/scores.service';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { id }: { id: string } = JSON.parse(event.body || '{}');

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Golfer ID is required' }),
      };
    }

    // First, delete all scores associated with this golfer
    const deletedScoresCount = await deleteScoresForGolfer(id);

    // Then delete the golfer
    const deleted = await deleteGolfer(id);

    if (!deleted) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Golfer not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: `Golfer deleted successfully${deletedScoresCount > 0 ? ` (${deletedScoresCount} scores also removed)` : ''}` 
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete golfer';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
