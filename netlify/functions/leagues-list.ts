// GET /.netlify/functions/leagues-list

import { withVerifiedAuth, apiResponse } from './_shared/middleware';
import { getUserLeagues } from './_shared/services/leagues.service';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'GET') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const leagues = await getUserLeagues(event.user.userId);
    return apiResponse(200, leagues);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch leagues';
    return apiResponse(500, null, message);
  }
});
