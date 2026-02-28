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

vi.mock('./_shared/utils/perf', () => ({
  createPerfTimer: vi.fn().mockReturnValue({
    measure: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
    end: vi.fn(),
  }),
}));

const mockEnterScore = vi.fn();
const mockBulkEnterScores = vi.fn();

vi.mock('./_shared/services/scores.service', () => ({
  enterScore: (...args: unknown[]) => mockEnterScore(...args),
  bulkEnterScores: (...args: unknown[]) => mockBulkEnterScores(...args),
}));

vi.mock('./_shared/validators/scores.validator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_shared/validators/scores.validator')>();
  return actual;
});

import { handler } from './scores-enter';

describe('scores-enter handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enters a single score on POST', async () => {
    const scoreData = { id: 's1', tournamentId: 't1', golferId: 'g1', points: 10 };
    mockEnterScore.mockResolvedValue(scoreData);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        tournamentId: 't1',
        golferId: 'g1',
        position: 5,
        rawScore: -3,
        participated: true,
      }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(scoreData);
  });

  it('enters bulk scores on POST', async () => {
    const bulkResult = [{ id: 's1' }, { id: 's2' }];
    mockBulkEnterScores.mockResolvedValue(bulkResult);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        tournamentId: 't1',
        scores: [
          { golferId: 'g1', position: 1, rawScore: -10, participated: true },
          { golferId: 'g2', position: 2, rawScore: -8, participated: true },
        ],
      }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(bulkResult);
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(405);
    expect(body.success).toBe(false);
  });
});
