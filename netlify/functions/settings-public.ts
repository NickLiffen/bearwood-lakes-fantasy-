// GET /.netlify/functions/settings-public
// Public settings readable by any authenticated user

import { createAuthHandler, apiResponse } from './_shared/middleware';
import { getAppSettings } from './_shared/services/settings.service';

export const handler = createAuthHandler({
  allowedMethods: ['GET'],
  handler: async () => {
    const settings = await getAppSettings();

    return apiResponse(200, {
      transfersOpen: settings.transfersOpen,
      registrationOpen: settings.registrationOpen,
      allowNewTeamCreation: settings.allowNewTeamCreation,
    });
  },
});
