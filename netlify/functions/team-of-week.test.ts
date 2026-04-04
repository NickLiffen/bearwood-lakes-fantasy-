import { handler } from './team-of-week';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-1',
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
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockGetTeamOfTheWeek = vi.fn();

vi.mock('./_shared/services/leaderboard.service', () => ({
  getTeamOfTheWeek: (...args: unknown[]) => mockGetTeamOfTheWeek(...args),
}));

vi.mock('./_shared/services/seasons.service', () => ({
  getActiveSeason: vi.fn().mockResolvedValue({ name: '2026' }),
}));

beforeEach(() => vi.clearAllMocks());

describe('team-of-week handler', () => {
  it('returns 405 for non-GET requests', async () => {
    const res = await handler(makeAuthEvent({ httpMethod: 'POST' }), mockContext);
    expect(res!.statusCode).toBe(405);
  });

  it('returns 400 when date param is missing', async () => {
    const res = await handler(makeAuthEvent({ queryStringParameters: {} }), mockContext);
    const body = parseBody(res!);
    expect(res!.statusCode).toBe(400);
    expect(body.error).toContain('date');
  });

  it('returns 400 when date format is invalid', async () => {
    const res = await handler(
      makeAuthEvent({ queryStringParameters: { date: 'not-a-date' } }),
      mockContext
    );
    const body = parseBody(res!);
    expect(res!.statusCode).toBe(400);
    expect(body.error).toContain('YYYY-MM-DD');
  });

  it('returns 400 when week is not completed (service returns null)', async () => {
    mockGetTeamOfTheWeek.mockResolvedValue(null);

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { date: '2026-04-01', season: '2026' } }),
      mockContext
    );
    const body = parseBody(res!);
    expect(res!.statusCode).toBe(400);
    expect(body.error).toContain('completed');
  });

  it('returns 200 with dream team data for a completed week', async () => {
    const mockData = {
      golfers: [
        {
          golfer: { id: 'g1', firstName: 'Tiger', lastName: 'Woods', picture: '', price: 10000000 },
          weekPoints: 20,
          isCaptain: true,
        },
        {
          golfer: { id: 'g2', firstName: 'Rory', lastName: 'McIlroy', picture: '', price: 9000000 },
          weekPoints: 15,
          isCaptain: false,
        },
      ],
      totalPoints: 55,
      period: { label: 'Gameweek 5', startDate: '2026-03-21', endDate: '2026-03-27', gameweek: 5 },
      tournamentCount: 2,
    };
    mockGetTeamOfTheWeek.mockResolvedValue(mockData);

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { date: '2026-03-25', season: '2026' } }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.golfers).toHaveLength(2);
    expect(body.data.golfers[0].isCaptain).toBe(true);
    expect(body.data.totalPoints).toBe(55);
    expect(mockGetTeamOfTheWeek).toHaveBeenCalledWith('2026-03-25', 2026);
  });

  it('uses active season when season param not provided', async () => {
    mockGetTeamOfTheWeek.mockResolvedValue({
      golfers: [],
      totalPoints: 0,
      period: { label: 'Gameweek 1', startDate: '2026-01-01', endDate: '2026-01-07', gameweek: 1 },
      tournamentCount: 0,
    });

    await handler(makeAuthEvent({ queryStringParameters: { date: '2026-01-05' } }), mockContext);

    expect(mockGetTeamOfTheWeek).toHaveBeenCalledWith('2026-01-05', 2026);
  });

  it('returns 400 for invalid calendar date like 2026-99-99', async () => {
    const res = await handler(
      makeAuthEvent({ queryStringParameters: { date: '2026-99-99' } }),
      mockContext
    );
    const body = parseBody(res!);
    expect(res!.statusCode).toBe(400);
    expect(body.error).toContain('valid calendar date');
  });

  it('returns 500 when service throws an error', async () => {
    mockGetTeamOfTheWeek.mockRejectedValue(new Error('DB connection failed'));

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { date: '2026-03-25', season: '2026' } }),
      mockContext
    );
    const body = parseBody(res!);
    expect(res!.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('DB connection failed');
  });
});
