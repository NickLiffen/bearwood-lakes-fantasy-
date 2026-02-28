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

const mockGetScoresForTournament = vi.fn();
const mockGetAllScores = vi.fn();
const mockGetPublishedScores = vi.fn();

vi.mock('./_shared/services/scores.service', () => ({
  getScoresForTournament: (...args: unknown[]) => mockGetScoresForTournament(...args),
  getAllScores: (...args: unknown[]) => mockGetAllScores(...args),
  getPublishedScores: (...args: unknown[]) => mockGetPublishedScores(...args),
}));

import { handler } from './scores-list';

describe('scores-list handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all scores when no query params', async () => {
    const scores = [{ id: 's1', points: 10 }, { id: 's2', points: 20 }];
    mockGetAllScores.mockResolvedValue(scores);

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(scores);
    expect(mockGetAllScores).toHaveBeenCalled();
  });

  it('returns scores for specific tournament', async () => {
    const scores = [{ id: 's1', tournamentId: 't1', points: 10 }];
    mockGetScoresForTournament.mockResolvedValue(scores);

    const event = makeAuthEvent({
      queryStringParameters: { tournamentId: 't1' },
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data).toEqual(scores);
    expect(mockGetScoresForTournament).toHaveBeenCalledWith('t1');
  });

  it('returns published scores when publishedOnly=true', async () => {
    const scores = [{ id: 's1', points: 10 }];
    mockGetPublishedScores.mockResolvedValue(scores);

    const event = makeAuthEvent({
      queryStringParameters: { publishedOnly: 'true' },
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data).toEqual(scores);
    expect(mockGetPublishedScores).toHaveBeenCalled();
  });

  it('returns 500 on service error', async () => {
    mockGetAllScores.mockRejectedValue(new Error('DB error'));

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('DB error');
  });
});
