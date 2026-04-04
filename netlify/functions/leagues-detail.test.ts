import { handler } from './leagues-detail';
import { makeAuthEvent, mockContext, parseBody, createMockDb, mockCursor } from './__test-utils__';
import { connectToDatabase } from './_shared/db';
import { getActiveSeason, getSeasonByName } from './_shared/services/seasons.service';

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

vi.mock('./_shared/db', () => ({ connectToDatabase: vi.fn() }));
vi.mock('./_shared/services/seasons.service', () => ({
  getActiveSeason: vi.fn(),
  getSeasonByName: vi.fn(),
}));
vi.mock('./_shared/utils/dates', () => ({
  getWeekStart: vi.fn().mockImplementation((d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = (day + 1) % 7;
    date.setDate(date.getDate() - diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }),
  getWeekEnd: vi.fn().mockImplementation((ws: Date) => {
    const end = new Date(ws);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }),
  getMonthStart: vi.fn().mockImplementation((d: Date) => {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }),
  getTeamEffectiveStartDate: vi.fn().mockImplementation((d: Date) => new Date(d)),
  getGameweekNumber: vi.fn().mockReturnValue(5),
  getMonthEnd: vi.fn().mockImplementation((d: Date) => {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  }),
  getSeasonFirstSaturday: vi.fn().mockImplementation((d: Date) => {
    const date = new Date(d);
    while (date.getDay() !== 6) date.setDate(date.getDate() + 1);
    return date;
  }),
  getFirstGameweekStart: vi
    .fn()
    .mockImplementation((seasonStartDate: Date, firstGameweekStart?: Date | null) => {
      if (firstGameweekStart) {
        const d = new Date(firstGameweekStart);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      const date = new Date(seasonStartDate);
      while (date.getDay() !== 6) date.setDate(date.getDate() + 1);
      return date;
    }),
}));

const mockGetLeagueById = vi.fn();
const mockGetLeagueMembers = vi.fn();
vi.mock('./_shared/services/leagues.service', () => ({
  getLeagueById: (...args: unknown[]) => mockGetLeagueById(...args),
  getLeagueMembers: (...args: unknown[]) => mockGetLeagueMembers(...args),
}));

const mockSeason = {
  _id: 'season-1',
  name: '2025',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  isActive: true,
};

const mockLeague = {
  _id: 'league-1',
  name: 'Test League',
  adminId: 'user-player-1',
  memberIds: ['user-player-1', 'user-player-2'],
  inviteCode: 'ABC123',
};

function setupCollections(
  picks: Record<string, unknown>[] = [],
  users: Record<string, unknown>[] = [],
  tournaments: Record<string, unknown>[] = [],
  scores: Record<string, unknown>[] = []
) {
  const picksCursor = mockCursor(picks);
  const usersCursor = mockCursor(users);
  const tournamentsCursor = mockCursor(tournaments);
  const scoresCursor = mockCursor(scores);

  const { mockDb } = createMockDb({
    picks: { find: vi.fn().mockReturnValue(picksCursor) },
    users: { find: vi.fn().mockReturnValue(usersCursor) },
    tournaments: { find: vi.fn().mockReturnValue(tournamentsCursor) },
    scores: { find: vi.fn().mockReturnValue(scoresCursor) },
  });
  vi.mocked(connectToDatabase).mockResolvedValue(mockDb);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveSeason).mockResolvedValue(
    mockSeason as unknown as Awaited<ReturnType<typeof getActiveSeason>>
  );
  vi.mocked(getSeasonByName).mockResolvedValue(null);
  mockGetLeagueById.mockResolvedValue(mockLeague);
  mockGetLeagueMembers.mockResolvedValue([
    { userId: 'user-player-1', username: 'testplayer' },
    { userId: 'user-player-2', username: 'player2' },
  ]);
});

describe('leagues-detail handler', () => {
  it('returns 405 for non-GET methods', async () => {
    const res = await handler(
      makeAuthEvent({ httpMethod: 'POST', queryStringParameters: { leagueId: 'league-1' } }),
      mockContext
    );
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).success).toBe(false);
  });

  it('returns 400 when leagueId is missing', async () => {
    const res = await handler(makeAuthEvent(), mockContext);
    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toBe('leagueId is required');
  });

  it('returns 404 when league not found', async () => {
    mockGetLeagueById.mockResolvedValue(null);

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { leagueId: 'nonexistent' } }),
      mockContext
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockGetLeagueById.mockResolvedValue({ ...mockLeague, memberIds: ['other-user'] });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { leagueId: 'league-1' } }),
      mockContext
    );
    expect(res.statusCode).toBe(403);
    expect(parseBody(res).error).toBe('You are not a member of this league');
  });

  it('returns 200 with empty entries when no picks exist', async () => {
    setupCollections();

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { leagueId: 'league-1' } }),
      mockContext
    );
    const body = parseBody(res);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.entries).toEqual([]);
    expect(body.data.tournamentCount).toBe(0);
  });

  it('returns 500 on service error', async () => {
    mockGetLeagueById.mockRejectedValue(new Error('DB down'));

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { leagueId: 'league-1' } }),
      mockContext
    );
    expect(res.statusCode).toBe(500);
    expect(parseBody(res).success).toBe(false);
  });
});
