// POST /.netlify/functions/leagues-leave

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { leaveLeague, getLeagueById } from './_shared/services/leagues.service';
import { leagueIdSchema } from '../../shared/validators/league.validators';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const data = leagueIdSchema.parse(JSON.parse(event.body || '{}'));
    const league = await getLeagueById(data.leagueId);
    if (!league) return apiResponse(404, null, 'League not found');
    if (!league.memberIds.includes(event.user.userId)) {
      return apiResponse(403, null, 'You are not a member of this league');
    }

    await leaveLeague(event.user.userId, data.leagueId);
    return apiResponse(200, { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to leave league';
    if (message.includes('Admin cannot')) return apiResponse(400, null, message);
    return apiResponse(500, null, message);
  }
});
