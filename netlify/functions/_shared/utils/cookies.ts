// Cookie utilities for refresh token handling

const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

/**
 * Create Set-Cookie header for refresh token (httpOnly, secure, sameSite)
 */
export function setRefreshTokenCookie(refreshToken: string): string {
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.CONTEXT === 'production';

  const parts = [
    `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}`,
    'HttpOnly',
    `Max-Age=${REFRESH_TOKEN_MAX_AGE}`,
    'Path=/',
    'SameSite=Lax',
  ];

  // Only add Secure flag in production (HTTPS)
  if (isProduction) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Create Set-Cookie header to clear refresh token
 */
export function clearRefreshTokenCookie(): string {
  return `${REFRESH_TOKEN_COOKIE_NAME}=; HttpOnly; Max-Age=0; Path=/; SameSite=Lax`;
}

/**
 * Parse refresh token from cookie header
 */
export function getRefreshTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=');
    if (name === REFRESH_TOKEN_COOKIE_NAME) {
      return valueParts.join('='); // Handle values that might contain '='
    }
  }

  return null;
}

/**
 * Extract client info from request headers
 */
export function getClientInfo(headers: Record<string, string | undefined>): {
  userAgent: string | undefined;
  ipAddress: string | undefined;
} {
  return {
    userAgent: headers['user-agent'],
    ipAddress:
      headers['x-nf-client-connection-ip'] ||
      headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      headers['x-real-ip'],
  };
}
