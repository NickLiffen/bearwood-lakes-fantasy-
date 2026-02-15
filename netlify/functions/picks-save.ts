// POST /.netlify/functions/picks-save

import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { savePicks } from './_shared/services/picks.service';
import { validateBody, savePicksSchema } from './_shared/validators/picks.validator';

export const handler = withAuth(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { golferIds, captainId } = validateBody(savePicksSchema, event.body);
    const picks = await savePicks(event.user.userId, golferIds, 'Team selection', captainId);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: picks }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save picks';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
}, 'write');
