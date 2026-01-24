// POST /.netlify/functions/auth-register

import { registerUser } from './_shared/services/auth.service';
import { validateBody, registerSchema } from './_shared/validators/auth.validator';
import { getAppSettings } from './_shared/services/settings.service';
import { withRateLimit } from './_shared/middleware';

export const handler = withRateLimit(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Check if registration is open
    const settings = await getAppSettings();
    if (!settings.registrationOpen) {
      return {
        statusCode: 403,
        body: JSON.stringify({ 
          success: false, 
          error: 'Registration is currently closed. Please contact an administrator.' 
        }),
      };
    }

    const data = validateBody(registerSchema, event.body);
    const result = await registerUser(data);

    return {
      statusCode: 201,
      body: JSON.stringify({ success: true, data: result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    const statusCode = message.includes('already exists') ? 409 : 400;
    return {
      statusCode,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
}, 'auth');
