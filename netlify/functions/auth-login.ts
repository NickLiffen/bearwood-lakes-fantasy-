// POST /.netlify/functions/auth-login

import { loginUser } from './_shared/services/auth.service';
import { validateBody, loginSchema } from './_shared/validators/auth.validator';
import { withRateLimit, corsHeaders } from './_shared/middleware';
import { setRefreshTokenCookie, getClientInfo } from './_shared/utils/cookies';

export const handler = withRateLimit(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const credentials = validateBody(loginSchema, event.body);
    const { userAgent, ipAddress } = getClientInfo(event.headers);
    const result = await loginUser(credentials, userAgent, ipAddress);

    // Set refresh token as httpOnly cookie
    const cookieHeader = setRefreshTokenCookie(result.refreshToken);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Set-Cookie': cookieHeader,
      },
      body: JSON.stringify({
        success: true,
        data: {
          user: result.user,
          token: result.token,
          // Don't send refreshToken in body - it's in the cookie
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
}, 'auth');
