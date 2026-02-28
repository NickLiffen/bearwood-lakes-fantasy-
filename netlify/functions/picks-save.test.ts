import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const mockSavePicks = vi.fn();
vi.mock('./_shared/services/picks.service', () => ({
  savePicks: (...args: unknown[]) => mockSavePicks(...args),
}));

const mockValidateBody = vi.fn();
vi.mock('./_shared/validators/picks.validator', () => ({
  validateBody: (...args: unknown[]) => mockValidateBody(...args),
  savePicksSchema: {},
}));

import { handler } from './picks-save';

describe('picks-save handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves picks on POST success', async () => {
    const golferIds = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
    const captainId = 'g1';
    mockValidateBody.mockReturnValue({ golferIds, captainId });
    const savedPicks = { golferIds, captainId, totalSpent: 30_000_000 };
    mockSavePicks.mockResolvedValue(savedPicks);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ golferIds, captainId }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(savedPicks);
    expect(mockSavePicks).toHaveBeenCalledWith('user-admin-1', golferIds, 'Team selection', captainId);
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(405);
    expect(body.error).toBe('Method not allowed');
  });

  it('returns 400 on validation error', async () => {
    mockValidateBody.mockImplementation(() => {
      throw new Error('golferIds must contain exactly 6 items');
    });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ golferIds: ['g1'] }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('golferIds');
  });
});
