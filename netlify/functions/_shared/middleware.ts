// Middleware wrappers for Netlify Functions

import type { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import { verifyToken, JwtPayload } from './auth';
import {
  checkRateLimit,
  RateLimitConfig,
  RateLimitType,
  getRateLimitKeyFromEvent,
  rateLimitHeaders,
  rateLimitExceededResponse,
} from './rateLimit';

export interface AuthenticatedEvent extends HandlerEvent {
  user: JwtPayload;
}

type AuthenticatedHandler = (
  event: AuthenticatedEvent,
  context: HandlerContext
) => Promise<HandlerResponse>;

type PublicHandler = (
  event: HandlerEvent,
  context: HandlerContext
) => Promise<HandlerResponse>;

// Standard CORS headers for all authenticated routes
export const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Helper to add CORS headers to a response
 */
export function withCors(response: HandlerResponse): HandlerResponse {
  return {
    ...response,
    headers: { ...corsHeaders, ...response.headers },
  };
}

/**
 * Get endpoint name from path for rate limiting
 */
function getEndpointName(path: string): string {
  // Extract function name from path like /.netlify/functions/auth-login
  const match = path.match(/\/\.netlify\/functions\/([^?]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Wrapper that adds rate limiting to any handler
 */
export function withRateLimit(
  handler: PublicHandler,
  rateLimitType: RateLimitType = 'default'
): Handler {
  return async (event, context) => {
    // Handle CORS preflight (no rate limiting for OPTIONS)
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const endpoint = getEndpointName(event.path);
    const config = RateLimitConfig[rateLimitType];
    const key = getRateLimitKeyFromEvent(event.headers, endpoint);

    try {
      const result = await checkRateLimit(key, config);

      if (!result.allowed) {
        return withCors(rateLimitExceededResponse(result.retryAfter || 60));
      }

      const response = await handler(event, context);
      
      // Add rate limit headers to response
      return withCors({
        ...response,
        headers: {
          ...response.headers,
          ...rateLimitHeaders(config.maxRequests, result.remaining, result.resetAt),
        },
      });
    } catch (error) {
      console.error('Rate limit check error:', error);
      // On rate limit check failure, allow the request (fail open)
      const response = await handler(event, context);
      return withCors(response);
    }
  };
}

/**
 * Wrapper that requires authentication with rate limiting
 */
export function withAuth(
  handler: AuthenticatedHandler,
  rateLimitType: RateLimitType = 'default'
): Handler {
  return async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const authHeader = event.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return withCors({
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
    }

    try {
      const token = authHeader.slice(7);
      const user = verifyToken(token);

      // Rate limit by user ID for authenticated requests
      const endpoint = getEndpointName(event.path);
      const config = RateLimitConfig[rateLimitType];
      const key = getRateLimitKeyFromEvent(event.headers, endpoint, user.userId);

      const rateLimitResult = await checkRateLimit(key, config);

      if (!rateLimitResult.allowed) {
        return withCors(rateLimitExceededResponse(rateLimitResult.retryAfter || 60));
      }

      const authenticatedEvent = { ...event, user } as AuthenticatedEvent;
      const response = await handler(authenticatedEvent, context);
      
      return withCors({
        ...response,
        headers: {
          ...response.headers,
          ...rateLimitHeaders(config.maxRequests, rateLimitResult.remaining, rateLimitResult.resetAt),
        },
      });
    } catch (error) {
      // Check if it's a rate limit error or auth error
      if (error instanceof Error && error.message.includes('rate')) {
        console.error('Rate limit check error:', error);
        // Fail open for rate limit errors
        try {
          const token = event.headers.authorization?.slice(7) || '';
          const user = verifyToken(token);
          const authenticatedEvent = { ...event, user } as AuthenticatedEvent;
          const response = await handler(authenticatedEvent, context);
          return withCors(response);
        } catch {
          return withCors({
            statusCode: 401,
            body: JSON.stringify({ success: false, error: 'Invalid token' }),
          });
        }
      }
      
      return withCors({
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Invalid token' }),
      });
    }
  };
}

/**
 * Wrapper that requires admin role with rate limiting
 */
export function withAdmin(
  handler: AuthenticatedHandler,
  rateLimitType: RateLimitType = 'admin'
): Handler {
  return withAuth(async (event, context) => {
    if (event.user.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, error: 'Admin access required' }),
      };
    }
    return handler(event, context);
  }, rateLimitType);
}
