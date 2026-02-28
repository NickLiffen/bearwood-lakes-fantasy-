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

const mockGetAllUsers = vi.fn();
vi.mock('./_shared/services/users.service', () => ({
  getAllUsers: (...args: unknown[]) => mockGetAllUsers(...args),
}));

import { handler } from './users-list';

describe('users-list handler', () => {
  it('returns user list on success', async () => {
    const users = [
      { id: '1', username: 'alice', role: 'player' },
      { id: '2', username: 'bob', role: 'admin' },
    ];
    mockGetAllUsers.mockResolvedValue(users);

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(users);
  });

  it('returns 500 on service error', async () => {
    mockGetAllUsers.mockRejectedValue(new Error('DB down'));

    const res = await handler(makeAuthEvent(), mockContext);

    expect(res!.statusCode).toBe(500);
  });
});
