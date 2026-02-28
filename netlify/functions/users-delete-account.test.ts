import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'testadmin', role: 'admin', phoneVerified: true,
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

const { mockUsersCol, mockPicksCol, mockPickHistoryCol } = vi.hoisted(() => ({
  mockUsersCol: { deleteOne: vi.fn() },
  mockPicksCol: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }) },
  mockPickHistoryCol: { deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }) },
}));

vi.mock('./_shared/db', () => {
  const collectionMap: Record<string, unknown> = {
    users: mockUsersCol,
    picks: mockPicksCol,
    pickHistory: mockPickHistoryCol,
  };
  return {
    connectToDatabase: vi.fn().mockResolvedValue({
      db: { collection: vi.fn().mockImplementation((name: string) => collectionMap[name] || {}) },
      client: {},
    }),
  };
});

import { handler } from './users-delete-account';

describe('users-delete-account handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes own account successfully', async () => {
    mockUsersCol.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const event = makeAuthEvent({ httpMethod: 'DELETE' });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Account deleted successfully');
    expect(mockPicksCol.deleteMany).toHaveBeenCalledWith({ userId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(mockPickHistoryCol.deleteMany).toHaveBeenCalledWith({ userId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res!.statusCode).toBe(405);
  });
});
