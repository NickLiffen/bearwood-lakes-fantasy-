// DELETE /.netlify/functions/players-delete (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { deletePlayer } from './_shared/services/players.service';
import { deleteScoresForPlayer } from './_shared/services/scores.service';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { id }: { id: string } = JSON.parse(event.body || '{}');

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Player ID is required' }),
      };
    }

    // First, delete all scores associated with this player
    const deletedScoresCount = await deleteScoresForPlayer(id);

    // Then delete the player
    const deleted = await deletePlayer(id);

    if (!deleted) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Player not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: `Player deleted successfully${deletedScoresCount > 0 ? ` (${deletedScoresCount} scores also removed)` : ''}` 
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete player';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
