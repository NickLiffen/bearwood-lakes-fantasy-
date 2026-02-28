import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'testadmin', role: 'admin', phoneVerified: true,
  }),
  hashPassword: vi.fn().mockResolvedValue('hashed-temp-password'),
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
  mockUsersCol: {
    findOne: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  },
}));

vi.mock('./_shared/db', () => ({
  connectToDatabase: vi.fn().mockResolvedValue({
    db: { collection: vi.fn().mockReturnValue(mockUsersCol) },
    client: {},
  }),
}));

import { handler } from './users-reset-password';

describe('users-reset-password handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resets password and returns temp password on POST', async () => {
    mockUsersCol.findOne.mockResolvedValue({
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      firstName: 'John',
      lastName: 'Doe',
    });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ userId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.tempPassword).toBeDefined();
    expect(typeof body.data.tempPassword).toBe('string');
    expect(body.data.tempPassword.length).toBe(10);
    expect(mockUsersCol.updateOne).toHaveBeenCalled();
  });

  it('returns 400 when userId is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.error).toBe('userId is required');
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res!.statusCode).toBe(405);
  });
});
