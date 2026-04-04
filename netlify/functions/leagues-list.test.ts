import { handler } from './leagues-list';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-player-1',
    username: 'testplayer',
    role: 'player',
    phoneVerified: true,
  }),
}));
vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: {
    default: { windowMs: 60000, maxRequests: 100 },
    read: { windowMs: 60000, maxRequests: 120 },
    write: { windowMs: 60000, maxRequests: 30 },
    admin: { windowMs: 60000, maxRequests: 60 },
  },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
  getRedisClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  }),
  getRedisKeyPrefix: vi.fn().mockReturnValue('test:'),
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockGetUserLeagues = vi.fn();
vi.mock('./_shared/services/leagues.service', () => ({
  getUserLeagues: (...args: unknown[]) => mockGetUserLeagues(...args),
}));

beforeEach(() => vi.clearAllMocks());

describe('leagues-list handler', () => {
  it('returns 405 for non-GET methods', async () => {
    const res = await handler(makeAuthEvent({ httpMethod: 'POST' }), mockContext);
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).success).toBe(false);
  });

  it('returns user leagues on GET', async () => {
    const leagues = [
      { _id: 'l1', name: 'League A' },
      { _id: 'l2', name: 'League B' },
    ];
    mockGetUserLeagues.mockResolvedValue(leagues);

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(leagues);
    expect(mockGetUserLeagues).toHaveBeenCalledWith('user-player-1');
  });

  it('returns 500 on service error', async () => {
    mockGetUserLeagues.mockRejectedValue(new Error('DB down'));

    const res = await handler(makeAuthEvent(), mockContext);
    expect(res.statusCode).toBe(500);
    expect(parseBody(res).success).toBe(false);
  });
});
