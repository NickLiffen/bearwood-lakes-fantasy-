// POST /.netlify/functions/auth-refresh
// Refresh access token using refresh token from httpOnly cookie

import type { Handler } from '@netlify/functions';
import { refreshAccessToken } from './_shared/services/auth.service';
import { withCors } from './_shared/middleware';
import {
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getClientInfo,
} from './_shared/utils/cookies';

export const handler: Handler = async (event) => {
  const requestOrigin = event.headers.origin;

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return withCors({ statusCode: 204, body: '' }, requestOrigin);
  }

  if (event.httpMethod !== 'POST') {
    return withCors({
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }, requestOrigin);
  }

  try {
    const refreshToken = getRefreshTokenFromCookie(event.headers.cookie);

    if (!refreshToken) {
      return withCors({
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'No refresh token provided' }),
      }, requestOrigin);
    }

    const { userAgent, ipAddress } = getClientInfo(event.headers);
    const result = await refreshAccessToken(refreshToken, userAgent, ipAddress);

    // Set new refresh token cookie (token rotation)
    const cookieHeader = setRefreshTokenCookie(result.refreshToken);

    return withCors({
      statusCode: 200,
      headers: {
        'Set-Cookie': cookieHeader,
      },
      body: JSON.stringify({
        success: true,
        data: {
          user: result.user,
          token: result.token,
        },
      }),
    }, requestOrigin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    
    // Clear the invalid cookie
    return withCors({
      statusCode: 401,
      headers: {
        'Set-Cookie': clearRefreshTokenCookie(),
      },
      body: JSON.stringify({ success: false, error: message }),
    }, requestOrigin);
  }
};
