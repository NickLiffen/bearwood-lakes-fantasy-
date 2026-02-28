import { describe, it, expect, vi } from 'vitest';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-admin-1', username: 'testadmin', role: 'admin', phoneVerified: true,
  }),
}));
vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: { admin: { windowMs: 60000, maxRequests: 60 }, default: { windowMs: 60000, maxRequests: 100 }, read: { windowMs: 60000, maxRequests: 120 }, write: { windowMs: 60000, maxRequests: 30 } },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockGetUserPicksWithPlayers = vi.fn();
vi.mock('./_shared/services/picks.service', () => ({
  getUserPicksWithPlayers: (...args: unknown[]) => mockGetUserPicksWithPlayers(...args),
}));

import { handler } from './picks-get';

describe('picks-get handler', () => {
  it('returns picks on success', async () => {
    const picksData = {
      golferIds: ['g1', 'g2'],
      golfers: [
        { id: 'g1', name: 'Tiger Woods', price: 10_000_000 },
        { id: 'g2', name: 'Rory McIlroy', price: 9_000_000 },
      ],
    };
    mockGetUserPicksWithPlayers.mockResolvedValue(picksData);

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(picksData);
    expect(mockGetUserPicksWithPlayers).toHaveBeenCalledWith('user-admin-1');
  });

  it('returns 500 on service error', async () => {
    mockGetUserPicksWithPlayers.mockRejectedValue(new Error('DB error'));

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('DB error');
  });
});
