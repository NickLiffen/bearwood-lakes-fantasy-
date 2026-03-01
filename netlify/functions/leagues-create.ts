// POST /.netlify/functions/leagues-create

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { createLeague } from './_shared/services/leagues.service';
import { createLeagueSchema } from '../../shared/validators/league.validators';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const data = createLeagueSchema.parse(JSON.parse(event.body || '{}'));
    const league = await createLeague(event.user.userId, data.name, data.description);
    return apiResponse(200, league);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create league';
    if (message.includes('only be in')) return apiResponse(400, null, message);
    if (message.includes('validation')) return apiResponse(422, null, message);
    return apiResponse(500, null, message);
  }
});
