import { handler } from './leaderboard';
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
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockGetLeaderboard = vi.fn();
const mockGetFullLeaderboard = vi.fn();
const mockGetTournamentLeaderboard = vi.fn();

vi.mock('./_shared/services/leaderboard.service', () => ({
  getLeaderboard: (...args: any[]) => mockGetLeaderboard(...args),
  getFullLeaderboard: (...args: any[]) => mockGetFullLeaderboard(...args),
  getTournamentLeaderboard: (...args: any[]) => mockGetTournamentLeaderboard(...args),
}));

beforeEach(() => vi.clearAllMocks());

describe('leaderboard handler', () => {
  it('returns default leaderboard when no query params', async () => {
    mockGetLeaderboard.mockResolvedValue([{ rank: 1, username: 'alice', totalPoints: 100 }]);

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ rank: 1, username: 'alice', totalPoints: 100 }]);
    expect(mockGetLeaderboard).toHaveBeenCalledTimes(1);
  });

  it('returns full leaderboard when view=full', async () => {
    const fullData = { season: [], month: [], week: [], currentMonth: 'June' };
    mockGetFullLeaderboard.mockResolvedValue(fullData);

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { view: 'full' } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data).toEqual(fullData);
    expect(mockGetFullLeaderboard).toHaveBeenCalledTimes(1);
    expect(mockGetLeaderboard).not.toHaveBeenCalled();
  });

  it('returns tournament leaderboard when tournamentId provided', async () => {
    mockGetTournamentLeaderboard.mockResolvedValue([{ rank: 1 }]);

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { tournamentId: 'tourn-1' } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(mockGetTournamentLeaderboard).toHaveBeenCalledWith('tourn-1');
    expect(body.data).toEqual([{ rank: 1 }]);
  });

  it('returns 500 on service error', async () => {
    mockGetLeaderboard.mockRejectedValue(new Error('DB down'));

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('DB down');
  });
});
