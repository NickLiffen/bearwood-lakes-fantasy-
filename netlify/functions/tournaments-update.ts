// PUT /.netlify/functions/tournaments-update

import { updateTournament } from './_shared/services/tournaments.service';
import { recalculateScoresForTournament } from './_shared/services/scores.service';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { id, name, startDate, endDate, tournamentType, playerCountTier, status, participatingPlayerIds } = body;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Tournament id is required' }),
      };
    }

    const tournament = await updateTournament(id, {
      name,
      startDate,
      endDate,
      tournamentType,
      playerCountTier,
      status,
      participatingPlayerIds,
    });

    if (!tournament) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Tournament not found' }),
      };
    }

    // Recalculate scores if tournament type changed (multiplier affects points)
    if (tournamentType !== undefined) {
      await recalculateScoresForTournament(id);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: tournament,
        message: 'Tournament updated successfully',
      }),
    };
  } catch (error) {
    console.error('Error updating tournament:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Failed to update tournament',
      }),
    };
  }
});

export { handler };
