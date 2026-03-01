// POST /.netlify/functions/leagues-join

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { joinLeague } from './_shared/services/leagues.service';
import { joinLeagueSchema } from '../../shared/validators/league.validators';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const data = joinLeagueSchema.parse(JSON.parse(event.body || '{}'));
    const league = await joinLeague(event.user.userId, data.inviteCode);
    return apiResponse(200, league);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to join league';
    if (message.includes('Invalid invite') || message.includes('already a member') || message.includes('full') || message.includes('only be in')) {
      return apiResponse(400, null, message);
    }
    return apiResponse(500, null, message);
  }
});
