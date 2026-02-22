// POST /.netlify/functions/auth-logout
// Clear refresh token cookie and optionally revoke token

import type { Handler } from '@netlify/functions';
import { revokeRefreshToken } from './_shared/services/auth.service';
import { withCors } from './_shared/middleware';
import { getRefreshTokenFromCookie, clearRefreshTokenCookie } from './_shared/utils/cookies';

export const handler: Handler = async (event) => {
  const requestOrigin = event.headers.origin;

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return withCors({ statusCode: 204, body: '' }, requestOrigin);
  }

  if (event.httpMethod !== 'POST') {
    return withCors(
      {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      },
      requestOrigin
    );
  }

  try {
    const refreshToken = getRefreshTokenFromCookie(event.headers.cookie);

    // Revoke the token in database if it exists
    if (refreshToken) {
      await revokeRefreshToken(refreshToken).catch(() => {
        // Ignore errors - token might already be revoked or expired
      });
    }

    // Always clear the cookie
    return withCors(
      {
        statusCode: 200,
        headers: {
          'Set-Cookie': clearRefreshTokenCookie(),
        },
        body: JSON.stringify({ success: true }),
      },
      requestOrigin
    );
  } catch {
    // Even on error, clear the cookie
    return withCors(
      {
        statusCode: 200,
        headers: {
          'Set-Cookie': clearRefreshTokenCookie(),
        },
        body: JSON.stringify({ success: true }),
      },
      requestOrigin
    );
  }
};
