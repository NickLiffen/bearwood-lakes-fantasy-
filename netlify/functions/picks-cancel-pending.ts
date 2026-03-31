// POST /.netlify/functions/picks-cancel-pending

import { withVerifiedAuth, AuthenticatedEvent } from './_shared/middleware';
import { cancelPendingChanges } from './_shared/services/picks.service';

export const handler = withVerifiedAuth(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    await cancelPendingChanges(event.user.userId);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Pending changes cancelled' }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel pending changes';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
}, 'write');
