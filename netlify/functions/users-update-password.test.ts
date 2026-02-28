import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'testadmin', role: 'admin', phoneVerified: true,
  }),
  comparePassword: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue('new-hashed-password'),
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

import { handler } from './users-update-password';
import { comparePassword } from './_shared/auth';

describe('users-update-password handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersCol.findOne.mockResolvedValue({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', passwordHash: 'old-hash' });
  });

  it('updates password successfully on PUT', async () => {
    vi.mocked(comparePassword).mockResolvedValue(true);

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ currentPassword: 'oldpass123', newPassword: 'newpass123' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Password updated successfully');
    expect(mockUsersCol.updateOne).toHaveBeenCalled();
  });

  it('returns 401 when current password is wrong', async () => {
    vi.mocked(comparePassword).mockResolvedValue(false);

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ currentPassword: 'wrongpass', newPassword: 'newpass123' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(401);
    expect(body.error).toBe('Current password is incorrect');
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res!.statusCode).toBe(405);
  });
});
