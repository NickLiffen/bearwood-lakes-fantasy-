import {
  RateLimitConfig,
  rateLimitHeaders,
  rateLimitExceededResponse,
  createRateLimitKey,
  getRateLimitKeyFromEvent,
  getRedisKeyPrefix,
} from './rateLimit';

describe('rateLimit', () => {
  describe('RateLimitConfig', () => {
    it('has all expected rate limit types', () => {
      expect(RateLimitConfig.auth).toBeDefined();
      expect(RateLimitConfig.read).toBeDefined();
      expect(RateLimitConfig.write).toBeDefined();
      expect(RateLimitConfig.admin).toBeDefined();
      expect(RateLimitConfig.verification).toBeDefined();
      expect(RateLimitConfig.default).toBeDefined();
    });

    it('auth is stricter than default', () => {
      expect(RateLimitConfig.auth.maxRequests).toBeLessThan(RateLimitConfig.default.maxRequests);
    });

    it('read is more lenient than write', () => {
      expect(RateLimitConfig.read.maxRequests).toBeGreaterThan(RateLimitConfig.write.maxRequests);
    });

    it('verification is the strictest', () => {
      expect(RateLimitConfig.verification.maxRequests).toBeLessThanOrEqual(
        RateLimitConfig.auth.maxRequests
      );
    });

    it('all windows are positive', () => {
      Object.values(RateLimitConfig).forEach((config) => {
        expect(config.windowMs).toBeGreaterThan(0);
        expect(config.maxRequests).toBeGreaterThan(0);
      });
    });
  });

  describe('rateLimitHeaders', () => {
    it('returns correct header format', () => {
      const resetAt = new Date('2025-01-15T12:00:00Z');
      const headers = rateLimitHeaders(100, 95, resetAt);

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('95');
      expect(headers['X-RateLimit-Reset']).toBe(Math.ceil(resetAt.getTime() / 1000).toString());
    });

    it('clamps remaining to 0 when negative', () => {
      const headers = rateLimitHeaders(10, -5, new Date());

      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });
  });

  describe('rateLimitExceededResponse', () => {
    it('returns 429 with retry-after', () => {
      const response = rateLimitExceededResponse(30);

      expect(response.statusCode).toBe(429);
      expect(response.headers['Retry-After']).toBe('30');
      expect(response.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Too many requests');
      expect(body.retryAfter).toBe(30);
    });
  });

  describe('createRateLimitKey', () => {
    it('creates correctly formatted key', () => {
      const key = createRateLimitKey('user-123', 'auth-login');

      expect(key).toContain('v1:ratelimit:user-123:auth-login');
    });

    it('includes prefix from environment', () => {
      vi.stubEnv('REDIS_KEY_PREFIX', 'staging:');

      const key = createRateLimitKey('user-123', 'auth-login');

      expect(key).toBe('staging:v1:ratelimit:user-123:auth-login');

      vi.unstubAllEnvs();
    });
  });

  describe('getRateLimitKeyFromEvent', () => {
    it('uses userId when provided', () => {
      const headers = { 'x-nf-client-connection-ip': '1.2.3.4' };
      const key = getRateLimitKeyFromEvent(headers, 'test', 'user-456');

      expect(key).toContain('user-456');
      expect(key).toContain('test');
    });

    it('falls back to client IP when no userId', () => {
      const headers = { 'x-nf-client-connection-ip': '1.2.3.4' };
      const key = getRateLimitKeyFromEvent(headers, 'test');

      expect(key).toContain('1.2.3.4');
    });

    it('uses x-forwarded-for when x-nf-client-connection-ip missing', () => {
      const headers = { 'x-forwarded-for': '5.6.7.8, 9.10.11.12' };
      const key = getRateLimitKeyFromEvent(headers, 'test');

      expect(key).toContain('5.6.7.8');
    });

    it('uses "unknown" when no IP headers present', () => {
      const key = getRateLimitKeyFromEvent({}, 'test');

      expect(key).toContain('unknown');
    });
  });

  describe('getRedisKeyPrefix', () => {
    it('returns empty string when env not set', () => {
      vi.stubEnv('REDIS_KEY_PREFIX', '');

      const prefix = getRedisKeyPrefix();

      expect(prefix).toBe('');

      vi.unstubAllEnvs();
    });

    it('returns env value when set', () => {
      vi.stubEnv('REDIS_KEY_PREFIX', 'preview-123:');

      const prefix = getRedisKeyPrefix();

      expect(prefix).toBe('preview-123:');

      vi.unstubAllEnvs();
    });
  });
});
