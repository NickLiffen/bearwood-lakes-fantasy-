// Rate limiting for Netlify Functions using MongoDB

import { connectToDatabase } from './db';

interface RateLimitRecord {
  key: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
}

const RATE_LIMIT_COLLECTION = 'rateLimits';

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
 * Check rate limit for a given key
 * Returns { allowed: boolean, remaining: number, resetAt: Date }
 */
export async function checkRateLimit(
  key: string,
  config: { windowMs: number; maxRequests: number }
): Promise<{ allowed: boolean; remaining: number; resetAt: Date; retryAfter?: number }> {
  const { db } = await connectToDatabase();
  const collection = db.collection<RateLimitRecord>(RATE_LIMIT_COLLECTION);

  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowMs);

  // Find existing rate limit record
  const record = await collection.findOne({ key });

  if (!record || record.windowStart < windowStart) {
    // No record or window expired - create/reset
    const expiresAt = new Date(now.getTime() + config.windowMs);
    
    await collection.updateOne(
      { key },
      {
        $set: {
          key,
          count: 1,
          windowStart: now,
          expiresAt,
        },
      },
      { upsert: true }
    );

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: expiresAt,
    };
  }

  // Check if limit exceeded
  if (record.count >= config.maxRequests) {
    const retryAfter = Math.ceil((record.windowStart.getTime() + config.windowMs - now.getTime()) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(record.windowStart.getTime() + config.windowMs),
      retryAfter: Math.max(1, retryAfter),
    };
  }

  // Increment counter
  await collection.updateOne(
    { key },
    { $inc: { count: 1 } }
  );

  return {
    allowed: true,
    remaining: config.maxRequests - record.count - 1,
    resetAt: new Date(record.windowStart.getTime() + config.windowMs),
  };
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

/**
 * Clean up expired rate limit records (call periodically)
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  const { db } = await connectToDatabase();
  const collection = db.collection<RateLimitRecord>(RATE_LIMIT_COLLECTION);
  
  const result = await collection.deleteMany({
    expiresAt: { $lt: new Date() },
  });
  
  return result.deletedCount;
}

// Ensure TTL index exists for automatic cleanup
export async function ensureRateLimitIndexes(): Promise<void> {
  const { db } = await connectToDatabase();
  const collection = db.collection<RateLimitRecord>(RATE_LIMIT_COLLECTION);
  
  // Create TTL index to automatically remove expired documents
  await collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
  ).catch(() => {
    // Index might already exist
  });
  
  // Create index on key for fast lookups
  await collection.createIndex({ key: 1 }, { unique: true }).catch(() => {
    // Index might already exist
  });
}
