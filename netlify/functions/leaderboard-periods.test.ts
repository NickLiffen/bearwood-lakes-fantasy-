import { ObjectId } from 'mongodb';
import { handler } from './leaderboard-periods';
import { makeAuthEvent, mockContext, parseBody, createMockDb, mockCursor } from './__test-utils__';
import { connectToDatabase } from './_shared/db';
import { getActiveSeason, getSeasonByName } from './_shared/services/seasons.service';
import { getWeekStart, getMonthStart, getTeamEffectiveStartDate, getGameweekNumber } from './_shared/utils/dates';

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

vi.mock('./_shared/db', () => ({ connectToDatabase: vi.fn() }));
vi.mock('./_shared/services/seasons.service', () => ({
  getActiveSeason: vi.fn(),
  getSeasonByName: vi.fn(),
}));
vi.mock('./_shared/utils/dates', () => ({
  getWeekStart: vi.fn().mockImplementation((d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = (day + 1) % 7; // Saturday-based
    date.setDate(date.getDate() - diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }),
  getMonthStart: vi.fn().mockImplementation((d: Date) => {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }),
  getTeamEffectiveStartDate: vi.fn().mockImplementation((d: Date) => new Date(d)),
  getGameweekNumber: vi.fn().mockReturnValue(5),
}));

const mockSeason = {
  _id: 'season-1',
  name: '2025',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  isActive: true,
};

function setupCollections(picks: any[] = [], users: any[] = [], tournaments: any[] = [], scores: any[] = []) {
  const { mockDb } = createMockDb({
    picks: { find: vi.fn().mockReturnValue(mockCursor(picks)) },
    users: { find: vi.fn().mockReturnValue(mockCursor(users)) },
    tournaments: { find: vi.fn().mockReturnValue(mockCursor(tournaments)) },
    scores: { find: vi.fn().mockReturnValue(mockCursor(scores)) },
  });
  vi.mocked(connectToDatabase).mockResolvedValue(mockDb);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveSeason).mockResolvedValue(mockSeason as any);
  vi.mocked(getSeasonByName).mockResolvedValue(null);
});

describe('leaderboard-periods handler', () => {
  it('returns empty data when no picks exist', async () => {
    setupCollections();

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.entries).toEqual([]);
    expect(body.data.tournamentCount).toBe(0);
  });

  it('returns leaders summary with null leaders when no picks and action=leaders', async () => {
    setupCollections();

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { action: 'leaders' } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.weeklyLeader).toBeNull();
    expect(body.data.monthlyLeader).toBeNull();
    expect(body.data.seasonLeader).toBeNull();
    expect(body.data.currentWeek).toHaveProperty('type', 'week');
    expect(body.data.currentMonth).toHaveProperty('type', 'month');
    expect(body.data.seasonInfo).toHaveProperty('type', 'season');
  });

  describe('period-specific leaderboards', () => {
    const userId = new ObjectId();
    const golferId = new ObjectId();
    const tournamentId = new ObjectId();
    const tournamentDate = new Date('2025-06-14');

    const picks = [{
      userId,
      golferIds: [golferId],
      captainId: null,
      totalSpent: 10_000_000,
      season: 2025,
      createdAt: new Date('2025-01-01'),
    }];
    const users = [{ _id: userId, username: 'alice', firstName: 'Alice', lastName: 'A' }];
    const tournaments = [{
      _id: tournamentId,
      name: 'The Open',
      status: 'published',
      season: 2025,
      startDate: tournamentDate,
    }];
    const scores = [{
      golferId,
      tournamentId,
      multipliedPoints: 25,
      participated: true,
    }];

    it('returns ranked entries for week period', async () => {
      setupCollections(picks, users, tournaments, scores);

      const res = await handler(
        makeAuthEvent({ queryStringParameters: { period: 'week', date: '2025-06-14' } }),
        mockContext,
      );
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.period.type).toBe('week');
      expect(body.data.entries).toBeInstanceOf(Array);
    });

    it('returns ranked entries for month period', async () => {
      setupCollections(picks, users, tournaments, scores);

      const res = await handler(
        makeAuthEvent({ queryStringParameters: { period: 'month', date: '2025-06-14' } }),
        mockContext,
      );
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.period.type).toBe('month');
    });

    it('returns ranked entries for season period', async () => {
      setupCollections(picks, users, tournaments, scores);

      const res = await handler(
        makeAuthEvent({ queryStringParameters: { period: 'season' } }),
        mockContext,
      );
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.period.type).toBe('season');
      expect(body.data.period.hasPrevious).toBe(false);
      expect(body.data.period.hasNext).toBe(false);
    });
  });

  it('returns leaders with picks and action=leaders', async () => {
    const userId = new ObjectId();
    const golferId = new ObjectId();
    const tournamentId = new ObjectId();

    const picks = [{
      userId,
      golferIds: [golferId],
      captainId: null,
      totalSpent: 10_000_000,
      season: 2025,
      createdAt: new Date('2025-01-01'),
    }];
    const users = [{ _id: userId, username: 'bob', firstName: 'Bob', lastName: 'B' }];
    const tournaments = [{
      _id: tournamentId,
      name: 'Masters',
      status: 'published',
      season: 2025,
      startDate: new Date(),
    }];
    const scores = [{
      golferId,
      tournamentId,
      multipliedPoints: 30,
      participated: true,
    }];

    setupCollections(picks, users, tournaments, scores);

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { action: 'leaders' } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data).toHaveProperty('weeklyLeader');
    expect(body.data).toHaveProperty('monthlyLeader');
    expect(body.data).toHaveProperty('seasonLeader');
    expect(body.data.currentWeek.type).toBe('week');
  });

  it('supports date navigation (hasPrevious/hasNext)', async () => {
    const userId = new ObjectId();
    setupCollections(
      [{ userId, golferIds: [], captainId: null, totalSpent: 0, season: 2025, createdAt: new Date('2025-01-01') }],
      [{ _id: userId, username: 'nav', firstName: 'Nav', lastName: 'T' }],
      [],
      [],
    );

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { period: 'week', date: '2025-06-14' } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.period).toHaveProperty('hasPrevious');
    expect(body.data.period).toHaveProperty('hasNext');
  });

  it('returns 500 on error', async () => {
    vi.mocked(connectToDatabase).mockRejectedValue(new Error('Connection failed'));

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Connection failed');
  });
});
