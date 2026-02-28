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
  mockUsersCol: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
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
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      username: doc.username,
    })),
  };
});

import { handler } from './users-update-profile';

describe('users-update-profile handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates profile successfully on PUT', async () => {
    mockUsersCol.findOne.mockResolvedValue(null); // no duplicate email
    mockUsersCol.findOneAndUpdate.mockResolvedValue({
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      firstName: 'New',
      lastName: 'Name',
      email: 'new@test.com',
      username: 'testadmin',
    });

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ firstName: 'New', lastName: 'Name', email: 'new@test.com' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Profile updated successfully');
  });

  it('returns 409 when email is duplicate', async () => {
    mockUsersCol.findOne.mockResolvedValue({ _id: 'other-user', email: 'taken@test.com' });

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ firstName: 'A', lastName: 'B', email: 'taken@test.com' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(409);
    expect(body.error).toBe('Email is already in use');
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res!.statusCode).toBe(405);
  });
});
