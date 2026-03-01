// DELETE /.netlify/functions/leagues-delete

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { deleteLeague, getLeagueById } from './_shared/services/leagues.service';
import { leagueIdSchema } from '../../shared/validators/league.validators';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const data = leagueIdSchema.parse(JSON.parse(event.body || '{}'));
    const league = await getLeagueById(data.leagueId);
    if (!league) return apiResponse(404, null, 'League not found');
    if (league.adminId !== event.user.userId) {
      return apiResponse(403, null, 'Only the league admin can delete the league');
    }

    await deleteLeague(data.leagueId);
    return apiResponse(200, { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete league';
    return apiResponse(500, null, message);
  }
});
