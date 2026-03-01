// POST /.netlify/functions/leagues-regenerate-code

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { regenerateInviteCode, getLeagueById } from './_shared/services/leagues.service';
import { leagueIdSchema } from '../../shared/validators/league.validators';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const data = leagueIdSchema.parse(JSON.parse(event.body || '{}'));
    const league = await getLeagueById(data.leagueId);
    if (!league) return apiResponse(404, null, 'League not found');
    if (league.adminId !== event.user.userId) {
      return apiResponse(403, null, 'Only the league admin can regenerate the invite code');
    }

    const updated = await regenerateInviteCode(data.leagueId);
    return apiResponse(200, updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to regenerate code';
    return apiResponse(500, null, message);
  }
});
