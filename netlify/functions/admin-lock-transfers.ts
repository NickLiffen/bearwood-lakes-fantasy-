// POST /.netlify/functions/admin-lock-transfers (Admin only)
// Toggles transfer window open/closed

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { getAppSettings, setTransfersOpen } from './_shared/services/settings.service';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // If explicit value provided, use it; otherwise toggle
    let newValue: boolean;
    if (typeof body.open === 'boolean') {
      newValue = body.open;
    } else {
      const currentSettings = await getAppSettings();
      newValue = !currentSettings.transfersOpen;
    }

    await setTransfersOpen(newValue);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          transfersOpen: newValue,
          message: newValue ? 'Transfers are now OPEN' : 'Transfers are now LOCKED',
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to toggle transfer lock';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
