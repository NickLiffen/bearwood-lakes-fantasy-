// DELETE /.netlify/functions/scores-delete

import { deleteScore, deleteScoresForTournament } from './_shared/services/scores.service';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { scoreId, tournamentId } = body;

    // Delete all scores for a tournament
    if (tournamentId) {
      const deletedCount = await deleteScoresForTournament(tournamentId);
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: `Deleted ${deletedCount} scores for tournament`,
          deletedCount,
        }),
      };
    }

    // Delete a single score
    if (scoreId) {
      const deleted = await deleteScore(scoreId);
      if (!deleted) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, error: 'Score not found' }),
        };
      }
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Score deleted successfully',
        }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: 'scoreId or tournamentId is required' }),
    };
  } catch (error) {
    console.error('Delete score error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete score',
      }),
    };
  }
});

export { handler };
