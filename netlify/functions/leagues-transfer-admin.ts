// POST /.netlify/functions/leagues-transfer-admin

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { transferAdmin, getLeagueById } from './_shared/services/leagues.service';
import { transferAdminSchema } from '../../shared/validators/league.validators';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const data = transferAdminSchema.parse(JSON.parse(event.body || '{}'));
    const league = await getLeagueById(data.leagueId);
    if (!league) return apiResponse(404, null, 'League not found');
    if (league.adminId !== event.user.userId) {
      return apiResponse(403, null, 'Only the league admin can transfer ownership');
    }

    const updated = await transferAdmin(data.leagueId, data.newAdminId);
    return apiResponse(200, updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to transfer admin';
    if (message.includes('must be a current member')) return apiResponse(400, null, message);
    return apiResponse(500, null, message);
  }
});
