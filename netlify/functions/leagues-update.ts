// PUT /.netlify/functions/leagues-update

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { updateLeague, getLeagueById } from './_shared/services/leagues.service';
import { updateLeagueSchema } from '../../shared/validators/league.validators';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'PUT') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const data = updateLeagueSchema.parse(JSON.parse(event.body || '{}'));
    const league = await getLeagueById(data.id);
    if (!league) return apiResponse(404, null, 'League not found');
    if (league.adminId !== event.user.userId) {
      return apiResponse(403, null, 'Only the league admin can update settings');
    }

    const updated = await updateLeague(data.id, { name: data.name, description: data.description });
    return apiResponse(200, updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update league';
    return apiResponse(500, null, message);
  }
});
