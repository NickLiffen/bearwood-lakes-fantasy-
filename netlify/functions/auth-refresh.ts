// POST /.netlify/functions/auth-refresh
// Refresh access token using refresh token from httpOnly cookie

import type { Handler } from '@netlify/functions';
import { refreshAccessToken, RefreshError } from './_shared/services/auth.service';
import { withCors } from './_shared/middleware';
import {
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getClientInfo,
} from './_shared/utils/cookies';

// Error codes that mean the cookie is definitively invalid and should be cleared
const DEFINITIVE_FAILURE_CODES = new Set([
  'NO_REFRESH_TOKEN',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'USER_NOT_FOUND',
]);

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

    if (!refreshToken) {
      return withCors(
        {
          statusCode: 401,
          headers: {
            'Set-Cookie': clearRefreshTokenCookie(),
          },
          body: JSON.stringify({
            success: false,
            error: 'No refresh token provided',
            code: 'NO_REFRESH_TOKEN',
          }),
        },
        requestOrigin
      );
    }

    const { userAgent, ipAddress } = getClientInfo(event.headers);
    const result = await refreshAccessToken(refreshToken, userAgent, ipAddress);

    // Set new refresh token cookie (token rotation)
    const cookieHeader = setRefreshTokenCookie(result.refreshToken);

    return withCors(
      {
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
      },
      requestOrigin
    );
  } catch (error) {
    const isRefreshError = error instanceof RefreshError;
    const message = error instanceof Error ? error.message : 'Token refresh failed';

    if (isRefreshError) {
      const code = error.code;
      const statusCode = code === 'ROTATION_RACE' ? 409 : 401;

      // Only clear the cookie for definitive failures.
      // For ROTATION_RACE, the winning tab's Set-Cookie has already updated it — don't wipe it.
      const headers: Record<string, string> = {};
      if (DEFINITIVE_FAILURE_CODES.has(code)) {
        headers['Set-Cookie'] = clearRefreshTokenCookie();
      }

      return withCors(
        {
          statusCode,
          headers,
          body: JSON.stringify({ success: false, error: message, code }),
        },
        requestOrigin
      );
    }

    // Unexpected error (DB down, cold start, etc.) — return 5xx so client retries
    return withCors(
      {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: 'Internal server error during token refresh',
          code: 'INTERNAL_ERROR',
        }),
      },
      requestOrigin
    );
  }
};
