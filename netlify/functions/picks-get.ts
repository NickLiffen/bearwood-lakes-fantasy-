// GET /.netlify/functions/picks-get

import type { Handler } from '@netlify/functions';
import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { getUserPicksWithPlayers } from './_shared/services/picks.service';

export const handler: Handler = withAuth(async (event: AuthenticatedEvent) => {
  try {
    const picks = await getUserPicksWithPlayers(event.user.userId);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: picks }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch picks';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
