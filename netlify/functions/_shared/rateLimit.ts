// Rate limiting for Netlify Functions using Redis

import Redis from 'ioredis';

// Lazy-initialized Redis client
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error(
        'Missing Redis configuration. ' +
        'Please set the REDIS_URL environment variable (e.g. redis://:password@host:port).'
      );
    }

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
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
 * Check rate limit for a given key using Redis
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

    // Atomically increment counter and set TTL via pipeline
    const results = await redis.pipeline()
      .incr(windowKey)
      .expire(windowKey, windowSeconds)
      .exec();
    // ioredis pipeline returns [[err, result], ...] tuples
    if (!results || results[0]?.[0]) {
      throw new Error('Redis pipeline command failed');
    }
    const count = results[0][1] as number;

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
    // Fail open if Redis is unavailable, but log for visibility
    console.error('[RateLimit] Redis check failed, failing open:', error instanceof Error ? error.message : error);
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
 * Get the Redis key prefix for environment isolation (deploy previews).
 */
export function getRedisKeyPrefix(): string {
  return process.env.REDIS_KEY_PREFIX || '';
}

/**
 * Helper to create rate limit key
 */
export function createRateLimitKey(
  identifier: string,
  endpoint: string
): string {
  return `${getRedisKeyPrefix()}v1:ratelimit:${identifier}:${endpoint}`;
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
