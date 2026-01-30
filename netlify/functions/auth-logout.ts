// POST /.netlify/functions/auth-logout
// Clear refresh token cookie and optionally revoke token

import type { Handler } from '@netlify/functions';
import { revokeRefreshToken } from './_shared/services/auth.service';
import { corsHeaders } from './_shared/middleware';
import { getRefreshTokenFromCookie, clearRefreshTokenCookie } from './_shared/utils/cookies';

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
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
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Credentials': 'true',
        'Set-Cookie': clearRefreshTokenCookie(),
      },
      body: JSON.stringify({ success: true }),
    };
  } catch {
    // Even on error, clear the cookie
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Credentials': 'true',
        'Set-Cookie': clearRefreshTokenCookie(),
      },
      body: JSON.stringify({ success: true }),
    };
  }
};
