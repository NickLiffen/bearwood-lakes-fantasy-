// POST /.netlify/functions/auth-refresh
// Refresh access token using refresh token from httpOnly cookie

import type { Handler } from '@netlify/functions';
import { refreshAccessToken } from './_shared/services/auth.service';
import { corsHeaders } from './_shared/middleware';
import {
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getClientInfo,
} from './_shared/utils/cookies';

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

    if (!refreshToken) {
      return {
        statusCode: 401,
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ success: false, error: 'No refresh token provided' }),
      };
    }

    const { userAgent, ipAddress } = getClientInfo(event.headers);
    const result = await refreshAccessToken(refreshToken, userAgent, ipAddress);

    // Set new refresh token cookie (token rotation)
    const cookieHeader = setRefreshTokenCookie(result.refreshToken);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Credentials': 'true',
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
    const message = error instanceof Error ? error.message : 'Token refresh failed';
    
    // Clear the invalid cookie
    return {
      statusCode: 401,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Credentials': 'true',
        'Set-Cookie': clearRefreshTokenCookie(),
      },
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
