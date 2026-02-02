// GET/PUT /.netlify/functions/settings (Admin only)
// Get or update app settings

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { getAppSettings, setSetting } from './_shared/services/settings.service';

export const handler: Handler = withAdmin(async (event) => {
  // GET - retrieve all settings
  if (event.httpMethod === 'GET') {
    try {
      const settings = await getAppSettings();
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: settings }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get settings';
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: message }),
      };
    }
  }

  // PUT - update settings
  if (event.httpMethod === 'PUT') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { key, value } = body;

      if (!key) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'Setting key is required' }),
        };
      }

      // Validate allowed keys
      const allowedKeys = ['transfersOpen', 'currentSeason', 'registrationOpen', 'allowNewTeamCreation', 'seasonStartDate', 'seasonEndDate', 'maxTransfersPerWeek', 'maxPlayersPerTransfer'];
      if (!allowedKeys.includes(key)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: `Invalid setting key: ${key}` }),
        };
      }

      await setSetting(key, value);
      const updatedSettings = await getAppSettings();

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: updatedSettings }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update settings';
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: message }),
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
});
