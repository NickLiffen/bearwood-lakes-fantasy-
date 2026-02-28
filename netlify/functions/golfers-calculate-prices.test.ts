import { handler } from './golfers-calculate-prices';
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

vi.mock('./_shared/services/golfers.service');

import { calculateGolferPrices } from './_shared/services/golfers.service';
import { verifyToken } from './_shared/auth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockReturnValue({
    userId: 'user-admin-1', username: 'testadmin', role: 'admin', phoneVerified: true,
  });
});

describe('golfers-calculate-prices handler', () => {
  it('calculates prices and returns 200', async () => {
    const priceResult = { updated: 50, season: 2026 };
    vi.mocked(calculateGolferPrices).mockResolvedValue(priceResult as any);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ season: 2026 }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(priceResult);
    expect(calculateGolferPrices).toHaveBeenCalledWith(2026);
  });

  it('returns 405 for non-POST method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(405);
    expect(body.error).toContain('Method not allowed');
  });

  it('returns 422 for invalid season', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ season: 'invalid' }),
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(422);
  });

  it('returns 400 when calculateGolferPrices throws', async () => {
    vi.mocked(calculateGolferPrices).mockRejectedValue(new Error('Calculation failed'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ season: 2026 }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error).toBe('Calculation failed');
  });

  it('returns 403 for non-admin user', async () => {
    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-player-1', username: 'testplayer', role: 'player', phoneVerified: true,
    });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ season: 2026 }),
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(403);
  });
});
