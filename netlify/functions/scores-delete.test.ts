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

const mockDeleteScore = vi.fn();
const mockDeleteScoresForTournament = vi.fn();

vi.mock('./_shared/services/scores.service', () => ({
  deleteScore: (...args: unknown[]) => mockDeleteScore(...args),
  deleteScoresForTournament: (...args: unknown[]) => mockDeleteScoresForTournament(...args),
}));

import { handler } from './scores-delete';

describe('scores-delete handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a single score by scoreId', async () => {
    mockDeleteScore.mockResolvedValue(true);

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ scoreId: 's1' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Score deleted successfully');
    expect(mockDeleteScore).toHaveBeenCalledWith('s1');
  });

  it('deletes all scores for a tournament', async () => {
    mockDeleteScoresForTournament.mockResolvedValue(5);

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ tournamentId: 't1' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.deletedCount).toBe(5);
    expect(mockDeleteScoresForTournament).toHaveBeenCalledWith('t1');
  });

  it('returns 400 when no scoreId or tournamentId', async () => {
    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({}),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.error).toBe('scoreId or tournamentId is required');
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res!.statusCode).toBe(405);
  });
});
