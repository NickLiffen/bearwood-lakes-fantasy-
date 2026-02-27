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
import { createLogger, getRequestId } from './utils/logger';

export interface AuthenticatedEvent extends HandlerEvent {
  user: JwtPayload;
}

type AuthenticatedHandler = (
  event: AuthenticatedEvent,
  context: HandlerContext
) => Promise<HandlerResponse>;

type PublicHandler = (event: HandlerEvent, context: HandlerContext) => Promise<HandlerResponse>;

/**
 * Get allowed origin for CORS
 * In production, this should be restricted to your domain
 */
function getAllowedOrigin(requestOrigin: string | undefined): string {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

  // In development or if no origins configured, allow all
  if (allowedOrigins.length === 0) {
    return requestOrigin || '*';
  }

  // Check if request origin is in allowed list
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Default to first allowed origin
  return allowedOrigins[0];
}

// Base CORS headers for all routes (origin is set dynamically by withCors)
export const corsHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

/**
 * Helper to add CORS headers to a response with proper origin handling
 */
export function withCors(response: HandlerResponse, requestOrigin?: string): HandlerResponse {
  const origin = getAllowedOrigin(requestOrigin);
  return {
    ...response,
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Origin': origin,
      ...response.headers,
    },
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
    const requestOrigin = event.headers.origin;

    // Handle CORS preflight (no rate limiting for OPTIONS)
    if (event.httpMethod === 'OPTIONS') {
      return withCors({ statusCode: 204, body: '' }, requestOrigin);
    }

    const endpoint = getEndpointName(event.path);
    const config = RateLimitConfig[rateLimitType];
    const key = getRateLimitKeyFromEvent(event.headers, endpoint);

    try {
      const result = await checkRateLimit(key, config);

      if (!result.allowed) {
        return withCors(rateLimitExceededResponse(result.retryAfter || 60), requestOrigin);
      }

      const response = await handler(event, context);

      // Add rate limit headers to response
      return withCors(
        {
          ...response,
          headers: {
            ...response.headers,
            ...rateLimitHeaders(config.maxRequests, result.remaining, result.resetAt),
          },
        },
        requestOrigin
      );
    } catch (error) {
      console.error('Rate limit check error:', error);
      // On rate limit check failure, allow the request (fail open)
      const response = await handler(event, context);
      return withCors(response, requestOrigin);
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
    const requestOrigin = event.headers.origin;

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return withCors({ statusCode: 204, body: '' }, requestOrigin);
    }

    const authHeader = event.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return withCors(
        {
          statusCode: 401,
          body: JSON.stringify({ success: false, error: 'Unauthorized' }),
        },
        requestOrigin
      );
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
        return withCors(rateLimitExceededResponse(rateLimitResult.retryAfter || 60), requestOrigin);
      }

      const authenticatedEvent = { ...event, user } as AuthenticatedEvent;
      const response = await handler(authenticatedEvent, context);

      return withCors(
        {
          ...response,
          headers: {
            ...response.headers,
            ...rateLimitHeaders(
              config.maxRequests,
              rateLimitResult.remaining,
              rateLimitResult.resetAt
            ),
          },
        },
        requestOrigin
      );
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
          return withCors(response, requestOrigin);
        } catch {
          return withCors(
            {
              statusCode: 401,
              body: JSON.stringify({ success: false, error: 'Invalid token' }),
            },
            requestOrigin
          );
        }
      }

      return withCors(
        {
          statusCode: 401,
          body: JSON.stringify({ success: false, error: 'Invalid token' }),
        },
        requestOrigin
      );
    }
  };
}

/**
 * Wrapper that requires authentication AND phone verification with rate limiting.
 * Users with a valid JWT but phoneVerified=false get a 403.
 * Grandfathered users (phoneVerified=true in JWT) pass through normally.
 */
export function withVerifiedAuth(
  handler: AuthenticatedHandler,
  rateLimitType: RateLimitType = 'default'
): Handler {
  return withAuth(async (event, context) => {
    if (!event.user.phoneVerified) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, error: 'Phone verification required' }),
      };
    }
    return handler(event, context);
  }, rateLimitType);
}

/**
 * Wrapper that requires admin role with rate limiting
 */
export function withAdmin(
  handler: AuthenticatedHandler,
  rateLimitType: RateLimitType = 'admin'
): Handler {
  return withVerifiedAuth(async (event, context) => {
    if (event.user.role !== 'admin') {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, error: 'Admin access required' }),
      };
    }
    return handler(event, context);
  }, rateLimitType);
}

/**
 * Standard API response helper
 */
export function apiResponse<T>(
  statusCode: number,
  data: T | null,
  error?: string
): HandlerResponse {
  if (error) {
    return {
      statusCode,
      body: JSON.stringify({ success: false, error }),
    };
  }
  return {
    statusCode,
    body: JSON.stringify({ success: true, data }),
  };
}

/**
 * Standard error codes and messages
 */
export const ErrorCodes = {
  BAD_REQUEST: { status: 400, message: 'Bad request' },
  UNAUTHORIZED: { status: 401, message: 'Unauthorized' },
  FORBIDDEN: { status: 403, message: 'Forbidden' },
  NOT_FOUND: { status: 404, message: 'Not found' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed' },
  CONFLICT: { status: 409, message: 'Conflict' },
  VALIDATION_ERROR: { status: 422, message: 'Validation error' },
  RATE_LIMITED: { status: 429, message: 'Too many requests' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
} as const;

/**
 * Create a standardized handler with error handling and logging
 * This wrapper handles common concerns:
 * - HTTP method validation
 * - Error catching and formatting
 * - Request logging (with request ID)
 */
export function createHandler(config: {
  allowedMethods: string[];
  handler: PublicHandler;
  rateLimitType?: RateLimitType;
}): Handler {
  const wrappedHandler = withRateLimit(async (event, context) => {
    const requestId = getRequestId(event.headers);
    const endpoint = getEndpointName(event.path);
    const logger = createLogger({ requestId, endpoint });

    // Validate HTTP method
    if (!config.allowedMethods.includes(event.httpMethod)) {
      logger.warn('Method not allowed', { method: event.httpMethod });
      return apiResponse(405, null, 'Method not allowed');
    }

    logger.info('Request started', { method: event.httpMethod });
    const startTime = Date.now();

    try {
      const response = await config.handler(event, context);
      logger.info('Request completed', {
        duration: Date.now() - startTime,
        status: response.statusCode,
      });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle known error types
      if (error instanceof Error) {
        logger.error('Handler error', error, { duration });

        // Validation errors (from Zod or custom)
        if (error.name === 'ZodError' || error.message.includes('validation')) {
          return apiResponse(422, null, error.message);
        }
        // Not found errors
        if (error.message.includes('not found')) {
          return apiResponse(404, null, error.message);
        }
        // Conflict errors
        if (error.message.includes('already exists')) {
          return apiResponse(409, null, error.message);
        }
        // Return generic error in production, detailed in development
        const message =
          process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred';
        return apiResponse(500, null, message);
      }

      logger.error('Unknown error', undefined, { duration, error: String(error) });
      return apiResponse(500, null, 'An unexpected error occurred');
    }
  }, config.rateLimitType || 'default');

  return wrappedHandler;
}

/**
 * Create an authenticated handler with error handling
 */
export function createAuthHandler(config: {
  allowedMethods: string[];
  handler: AuthenticatedHandler;
  rateLimitType?: RateLimitType;
  requireAdmin?: boolean;
  requireVerified?: boolean;
}): Handler {
  const requireVerified = config.requireVerified !== false;
  const wrapper = config.requireAdmin
    ? withAdmin
    : requireVerified
      ? withVerifiedAuth
      : withAuth;

  return wrapper(async (event, context) => {
    const requestId = getRequestId(event.headers);
    const endpoint = getEndpointName(event.path);
    const logger = createLogger({
      requestId,
      endpoint,
      userId: event.user.userId,
    });

    // Validate HTTP method
    if (!config.allowedMethods.includes(event.httpMethod)) {
      logger.warn('Method not allowed', { method: event.httpMethod });
      return apiResponse(405, null, 'Method not allowed');
    }

    logger.info('Authenticated request started', { method: event.httpMethod });
    const startTime = Date.now();

    try {
      const response = await config.handler(event, context);
      logger.info('Request completed', {
        duration: Date.now() - startTime,
        status: response.statusCode,
      });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof Error) {
        logger.error('Handler error', error, { duration });

        if (error.name === 'ZodError' || error.message.includes('validation')) {
          return apiResponse(422, null, error.message);
        }
        if (error.message.includes('not found')) {
          return apiResponse(404, null, error.message);
        }
        if (error.message.includes('already exists')) {
          return apiResponse(409, null, error.message);
        }
        const message =
          process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred';
        return apiResponse(500, null, message);
      }

      logger.error('Unknown error', undefined, { duration, error: String(error) });
      return apiResponse(500, null, 'An unexpected error occurred');
    }
  }, config.rateLimitType || 'default');
}
