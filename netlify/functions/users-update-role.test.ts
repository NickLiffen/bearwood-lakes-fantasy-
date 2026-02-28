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

const { mockUsersCol } = vi.hoisted(() => ({
  mockUsersCol: { findOneAndUpdate: vi.fn() },
}));

vi.mock('./_shared/db', () => ({
  connectToDatabase: vi.fn().mockResolvedValue({
    db: { collection: vi.fn().mockReturnValue(mockUsersCol) },
    client: {},
  }),
}));

vi.mock('./_shared/models/User', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_shared/models/User')>();
  return {
    ...actual,
    toUser: vi.fn().mockImplementation((doc) => ({
      id: doc._id?.toString(),
      username: doc.username,
      role: doc.role,
    })),
  };
});

import { handler } from './users-update-role';

describe('users-update-role handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates role successfully on PUT', async () => {
    mockUsersCol.findOneAndUpdate.mockResolvedValue({
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      username: 'target',
      role: 'admin',
    });

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'admin' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('admin');
  });

  it('returns 400 for invalid role', async () => {
    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', role: 'superadmin' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.error).toContain('Role must be');
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res!.statusCode).toBe(405);
  });
});
