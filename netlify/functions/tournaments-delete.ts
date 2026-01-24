// DELETE /.netlify/functions/tournaments-delete

import { deleteTournament } from './_shared/services/tournaments.service';
import { getScoresForTournament } from './_shared/services/scores.service';
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
    const { id } = body;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Tournament id is required' }),
      };
    }

    // Check if tournament has scores associated with it
    const existingScores = await getScoresForTournament(id);
    const participatedScores = existingScores.filter(s => s.participated);
    
    if (participatedScores.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: `Cannot delete tournament: it has ${participatedScores.length} score(s) associated with it. Please delete the scores first from the Scores page.`,
        }),
      };
    }

    // Delete the tournament (safe since no scores exist)
    const deleted = await deleteTournament(id);

    if (!deleted) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Tournament not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Tournament deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Delete tournament error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete tournament',
      }),
    };
  }
});

export { handler };
