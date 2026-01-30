// POST /.netlify/functions/auth-register

import { registerUser } from './_shared/services/auth.service';
import { validateBody, registerSchema } from './_shared/validators/auth.validator';
import { getAppSettings } from './_shared/services/settings.service';
import { withRateLimit, corsHeaders } from './_shared/middleware';
import { setRefreshTokenCookie, getClientInfo } from './_shared/utils/cookies';

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
    const { userAgent, ipAddress } = getClientInfo(event.headers);
    const result = await registerUser(data, userAgent, ipAddress);

    // Set refresh token as httpOnly cookie
    const cookieHeader = setRefreshTokenCookie(result.refreshToken);

    return {
      statusCode: 201,
      headers: {
        ...corsHeaders,
        'Set-Cookie': cookieHeader,
      },
      body: JSON.stringify({
        success: true,
        data: {
          user: result.user,
          token: result.token,
        },
      }),
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
