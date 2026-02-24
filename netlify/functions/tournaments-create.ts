// POST /.netlify/functions/tournaments-create

import { createTournament } from './_shared/services/tournaments.service';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';
import { TOURNAMENT_TYPE_CONFIG, type TournamentType } from '../../shared/types/tournament.types';

const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { name, startDate, endDate, tournamentType, scoringFormat, isMultiDay, playerCountTier, season } = body;

    if (!name || !startDate || !endDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'name, startDate, and endDate are required',
        }),
      };
    }

    const resolvedType: TournamentType = tournamentType || 'rollup_stableford';
    const config = TOURNAMENT_TYPE_CONFIG[resolvedType];

    const tournament = await createTournament({
      name,
      startDate,
      endDate,
      tournamentType: resolvedType,
      scoringFormat: config.forcedScoringFormat ?? scoringFormat ?? config.defaultScoringFormat,
      isMultiDay: isMultiDay ?? config.defaultMultiDay,
      golferCountTier: playerCountTier || '20+',
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
