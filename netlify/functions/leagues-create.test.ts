import { handler } from './leagues-create';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-player-1', username: 'testplayer', role: 'player', phoneVerified: true,
  }),
}));
vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: { default: { windowMs: 60000, maxRequests: 100 }, read: { windowMs: 60000, maxRequests: 120 }, write: { windowMs: 60000, maxRequests: 30 }, admin: { windowMs: 60000, maxRequests: 60 } },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
  getRedisClient: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') }),
  getRedisKeyPrefix: vi.fn().mockReturnValue('test:'),
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockCreateLeague = vi.fn();
vi.mock('./_shared/services/leagues.service', () => ({
  createLeague: (...args: any[]) => mockCreateLeague(...args),
}));

beforeEach(() => vi.clearAllMocks());

describe('leagues-create handler', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = await handler(makeAuthEvent({ httpMethod: 'GET' }), mockContext);
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).success).toBe(false);
  });

  it('creates a league on POST', async () => {
    const league = { _id: 'l1', name: 'Test League', adminId: 'user-player-1' };
    mockCreateLeague.mockResolvedValue(league);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Test League', description: 'A test league' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(league);
    expect(mockCreateLeague).toHaveBeenCalledWith('user-player-1', 'Test League', 'A test league');
  });

  it('returns 400 when user is in too many leagues', async () => {
    mockCreateLeague.mockRejectedValue(new Error('You can only be in 5 leagues'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Another League' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toBe('You can only be in 5 leagues');
  });

  it('returns 500 on unexpected service error', async () => {
    mockCreateLeague.mockRejectedValue(new Error('DB down'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ name: 'Fail League' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(500);
    expect(parseBody(res).success).toBe(false);
  });
});
