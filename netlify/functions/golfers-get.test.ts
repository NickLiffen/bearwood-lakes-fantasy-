import { handler } from './golfers-get';
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
vi.mock('./_shared/services/tournaments.service');
vi.mock('./_shared/services/scores.service');
vi.mock('./_shared/services/seasons.service');
vi.mock('./_shared/utils/dates', () => ({
  getWeekStart: vi.fn().mockReturnValue(new Date('2026-06-01')),
  getMonthStart: vi.fn().mockReturnValue(new Date('2026-06-01')),
  getSeasonStart: vi.fn().mockReturnValue(new Date('2026-01-01')),
}));

import { getGolferById } from './_shared/services/golfers.service';
import { getAllTournaments } from './_shared/services/tournaments.service';
import { getScoresForGolfer } from './_shared/services/scores.service';
import { getAllSeasons, getActiveSeason } from './_shared/services/seasons.service';

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getAllSeasons).mockResolvedValue([]);
  vi.mocked(getActiveSeason).mockResolvedValue({
    id: 's1', name: '2026', startDate: '2026-01-01', endDate: '2026-12-31', isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
  });
  vi.mocked(getAllTournaments).mockResolvedValue([]);
  vi.mocked(getScoresForGolfer).mockResolvedValue([]);
});

describe('golfers-get handler', () => {
  it('returns 400 when id param is missing', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET', queryStringParameters: {} });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Golfer ID is required');
  });

  it('returns 404 when golfer not found', async () => {
    vi.mocked(getGolferById).mockResolvedValue(null);

    const event = makeAuthEvent({
      httpMethod: 'GET',
      queryStringParameters: { id: 'nonexistent' },
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Golfer not found');
  });

  it('returns golfer with stats and season breakdowns', async () => {
    const golfer = {
      id: 'g1',
      firstName: 'Tiger',
      lastName: 'Woods',
      picture: 'pic.jpg',
      price: 5000000,
      isActive: true,
      stats2024: { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0, timesScored32Plus: 0 },
      stats2025: { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0, timesScored32Plus: 0 },
      stats2026: { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0, timesScored32Plus: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(getGolferById).mockResolvedValue(golfer);
    vi.mocked(getAllTournaments).mockResolvedValue([
      {
        id: 't1', name: 'The Open', startDate: '2026-06-15', endDate: '2026-06-18',
        status: 'published', season: 2026, courseName: 'St Andrews',
        multiplier: 1, bonusThreshold: 36, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    vi.mocked(getScoresForGolfer).mockResolvedValue([
      {
        id: 's1', golferId: 'g1', tournamentId: 't1', position: 1,
        multipliedPoints: 50, bonusPoints: 10, rawScore: 40, participated: true,
        score: 40, points: 40, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);
    vi.mocked(getAllSeasons).mockResolvedValue([
      {
        id: 's1', name: '2026', startDate: '2026-01-01', endDate: '2026-12-31',
        isActive: true, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);

    const event = makeAuthEvent({
      httpMethod: 'GET',
      queryStringParameters: { id: 'g1' },
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.firstName).toBe('Tiger');
    expect(body.data.stats2026).toBeDefined();
    expect(body.data.stats2026.timesPlayed).toBe(1);
    expect(body.data.stats2026.timesFinished1st).toBe(1);
    expect(body.data.points).toBeDefined();
    expect(body.data.points.season).toBe(50);
    expect(body.data.seasonStats).toBeDefined();
  });

  it('returns 500 on internal error', async () => {
    vi.mocked(getGolferById).mockRejectedValue(new Error('DB error'));

    const event = makeAuthEvent({
      httpMethod: 'GET',
      queryStringParameters: { id: 'g1' },
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('DB error');
  });
});
