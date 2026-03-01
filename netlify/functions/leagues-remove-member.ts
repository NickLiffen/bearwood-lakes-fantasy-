// POST /.netlify/functions/leagues-remove-member

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { removeMember, getLeagueById } from './_shared/services/leagues.service';
import { removeMemberSchema } from '../../shared/validators/league.validators';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const data = removeMemberSchema.parse(JSON.parse(event.body || '{}'));
    const league = await getLeagueById(data.leagueId);
    if (!league) return apiResponse(404, null, 'League not found');
    if (league.adminId !== event.user.userId) {
      return apiResponse(403, null, 'Only the league admin can remove members');
    }

    await removeMember(data.leagueId, data.userId);
    return apiResponse(200, { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove member';
    if (message.includes('Cannot remove') || message.includes('not a member')) {
      return apiResponse(400, null, message);
    }
    return apiResponse(500, null, message);
  }
});
