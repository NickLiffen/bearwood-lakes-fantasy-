// Rate limiting for Netlify Functions using Upstash Redis

import { Redis } from '@upstash/redis';

// Lazy-initialized Redis client
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'Missing Upstash Redis configuration. ' +
        'Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.'
      );
    }

    redisClient = new Redis({ url, token });
  }
  return redisClient;
}

// Rate limit configurations for different endpoint types
export const RateLimitConfig = {
  // Auth endpoints - stricter to prevent brute force
  auth: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute
  },
  // Read operations - more lenient
  read: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120, // 120 requests per minute
  },
  // Write operations - moderate
  write: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  },
  // Admin operations - moderate
  admin: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  },
  // Default - general purpose
  default: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
} as const;

export type RateLimitType = keyof typeof RateLimitConfig;

/**
 * Extract client IP from event headers
 */
function getClientIp(headers: Record<string, string | undefined>): string {
  // Netlify provides the client IP in x-nf-client-connection-ip header
  return (
    headers['x-nf-client-connection-ip'] ||
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['x-real-ip'] ||
    'unknown'
  );
}

/**
 * Check rate limit for a given key using Upstash Redis
 * Uses sliding window with Redis INCR and TTL
 */
export async function checkRateLimit(
  key: string,
  config: { windowMs: number; maxRequests: number }
): Promise<{ allowed: boolean; remaining: number; resetAt: Date; retryAfter?: number }> {
  const redis = getRedisClient();
  const windowSeconds = Math.ceil(config.windowMs / 1000);
  const now = Date.now();

  try {
    // Use Redis INCR with TTL for atomic rate limiting
    // Key format: ratelimit:{identifier}:{endpoint}:{window}
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`;

    // Increment counter and get current value
    const count = await redis.incr(windowKey);

    // Set TTL on first request in this window
    if (count === 1) {
      await redis.expire(windowKey, windowSeconds);
    }

    const resetAt = new Date(Math.ceil(now / config.windowMs) * config.windowMs + config.windowMs);
    const remaining = Math.max(0, config.maxRequests - count);

    if (count > config.maxRequests) {
      const retryAfter = Math.ceil((resetAt.getTime() - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  } catch (error) {
    // Log error but fail open (allow request if Redis is unavailable)
    console.error('Rate limit check failed:', error);
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now + config.windowMs),
    };
  }
}

/**
 * Create rate limit headers for response
 */
export function rateLimitHeaders(
  limit: number,
  remaining: number,
  resetAt: Date
): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': Math.max(0, remaining).toString(),
    'X-RateLimit-Reset': Math.ceil(resetAt.getTime() / 1000).toString(),
  };
}

/**
 * Rate limit response when limit exceeded
 */
export function rateLimitExceededResponse(retryAfter: number) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': retryAfter.toString(),
    },
    body: JSON.stringify({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter,
    }),
  };
}

/**
 * Helper to create rate limit key
 */
export function createRateLimitKey(
  identifier: string,
  endpoint: string
): string {
  return `ratelimit:${identifier}:${endpoint}`;
}

/**
 * Get rate limit key from event (uses IP for unauthenticated, userId for authenticated)
 */
export function getRateLimitKeyFromEvent(
  headers: Record<string, string | undefined>,
  endpoint: string,
  userId?: string
): string {
  const identifier = userId || getClientIp(headers);
  return createRateLimitKey(identifier, endpoint);
}
