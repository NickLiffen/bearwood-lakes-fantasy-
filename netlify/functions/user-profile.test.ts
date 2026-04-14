import { ObjectId } from 'mongodb';
import { handler } from './user-profile';
import { makeAuthEvent, mockContext, parseBody, createMockDb, mockCursor } from './__test-utils__';
import { connectToDatabase } from './_shared/db';
import { getActiveSeason } from './_shared/services/seasons.service';
import { applyPendingChanges } from './_shared/services/picks.service';
import type { Season } from '@shared/types';

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
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

vi.mock('./_shared/db', () => ({ connectToDatabase: vi.fn() }));
vi.mock('./_shared/services/seasons.service', () => ({ getActiveSeason: vi.fn() }));
vi.mock('./_shared/services/picks.service', () => ({
  applyPendingChanges: vi.fn().mockResolvedValue(false),
}));
vi.mock('./_shared/utils/dates', () => ({
  getWeekStart: vi.fn().mockImplementation((d: Date) => {
    const date = new Date(d);
    date.setDate(date.getDate() - ((date.getDay() + 1) % 7));
    date.setHours(0, 0, 0, 0);
    return date;
  }),
  getWeekEnd: vi.fn().mockImplementation((weekStart: Date) => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    end.setMilliseconds(end.getMilliseconds() - 1);
    return end;
  }),
  getMonthStart: vi
    .fn()
    .mockImplementation((d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)),
  getMonthEnd: vi
    .fn()
    .mockImplementation(
      (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    ),
  getSeasonStart: vi.fn().mockReturnValue(new Date('2025-01-01')),
  getTeamEffectiveStartDate: vi.fn().mockImplementation((d: Date) => new Date(d)),
  getFirstGameweekStart: vi.fn().mockImplementation((seasonStart: Date) => new Date(seasonStart)),
  getGameweekNumber: vi.fn().mockReturnValue(1),
}));

const mockSeason = {
  _id: 'season-1',
  name: '2025',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  isActive: true,
};

const targetUserId = new ObjectId();
const golferId1 = new ObjectId();
const golferId2 = new ObjectId();
const tournamentId = new ObjectId();

function setupDb(
  overrides: {
    user?: Record<string, unknown>;
    pick?: Record<string, unknown>;
    allPicks?: Record<string, unknown>[];
    golfers?: Record<string, unknown>[];
    tournaments?: Record<string, unknown>[];
    scores?: Record<string, unknown>[];
    pickHistory?: Record<string, unknown>[];
    historyGolfers?: Record<string, unknown>[];
  } = {}
) {
  const { mockDb } = createMockDb({
    users: {
      findOne: vi.fn().mockResolvedValue(overrides.user ?? null),
    },
    picks: {
      findOne: vi.fn().mockResolvedValue(overrides.pick ?? null),
      find: vi.fn().mockReturnValue(mockCursor(overrides.allPicks ?? [])),
    },
    golfers: {
      find: vi.fn().mockReturnValue(mockCursor(overrides.golfers ?? [])),
    },
    tournaments: {
      find: vi.fn().mockReturnValue(mockCursor(overrides.tournaments ?? [])),
    },
    scores: {
      find: vi.fn().mockReturnValue(mockCursor(overrides.scores ?? [])),
    },
    pickHistory: {
      find: vi.fn().mockReturnValue(mockCursor(overrides.pickHistory ?? [])),
    },
  });

  vi.mocked(connectToDatabase).mockResolvedValue(mockDb);
  return mockDb;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveSeason).mockResolvedValue(mockSeason as unknown as Season);
});

describe('user-profile handler', () => {
  it('returns 400 when userId is missing', async () => {
    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.error).toBe('userId is required');
  });

  it('returns 400 for invalid userId format', async () => {
    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: 'not-valid' } }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.error).toBe('Invalid userId format');
  });

  it('returns 404 when user not found', async () => {
    setupDb({ user: null });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(404);
    expect(body.error).toBe('User not found');
  });

  it('returns basic profile with hasTeam:false when no team', async () => {
    const user = {
      _id: targetUserId,
      firstName: 'Alice',
      lastName: 'Smith',
      username: 'alice',
      createdAt: new Date('2025-01-01'),
    };

    setupDb({ user, pick: null });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.hasTeam).toBe(false);
    expect(body.data.user.username).toBe('alice');
    expect(body.data.team).toBeNull();
    expect(body.data.history).toEqual([]);
  });

  it('returns full profile with stats and rankings when team exists', async () => {
    const user = {
      _id: targetUserId,
      firstName: 'Alice',
      lastName: 'Smith',
      username: 'alice',
      createdAt: new Date('2025-01-01'),
    };
    const pick = {
      userId: targetUserId,
      golferIds: [golferId1, golferId2],
      captainId: golferId1,
      totalSpent: 25_000_000,
      season: 2025,
      createdAt: new Date('2025-01-05'),
      updatedAt: new Date('2025-02-01'),
    };
    const golfers = [
      {
        _id: golferId1,
        firstName: 'Rory',
        lastName: 'McIlroy',
        picture: null,
        price: 12_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: golferId2,
        firstName: 'Tiger',
        lastName: 'Woods',
        picture: null,
        price: 13_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const tournaments = [
      {
        _id: tournamentId,
        name: 'Masters',
        status: 'published',
        season: 2025,
        startDate: new Date(),
      },
    ];
    const scores = [
      {
        golferId: golferId1,
        tournamentId,
        position: 2,
        basePoints: 80,
        bonusPoints: 5,
        multipliedPoints: 85,
        rawScore: -8,
        participated: true,
      },
    ];

    setupDb({
      user,
      pick,
      allPicks: [pick],
      golfers,
      tournaments,
      scores,
    });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.hasTeam).toBe(true);
    expect(body.data.user.firstName).toBe('Alice');
    expect(body.data.stats).toHaveProperty('weekPoints');
    expect(body.data.stats).toHaveProperty('monthPoints');
    expect(body.data.stats).toHaveProperty('seasonPoints');
    expect(body.data.stats).toHaveProperty('weekRank');
    expect(body.data.stats).toHaveProperty('monthRank');
    expect(body.data.stats).toHaveProperty('seasonRank');
    expect(body.data.team.golfers).toHaveLength(2);
    expect(body.data.team.totals.totalSpent).toBe(25_000_000);
    expect(body.data.captainId).toBe(golferId1.toString());

    // Safety-net: applyPendingChanges should be called for the requested user
    expect(applyPendingChanges).toHaveBeenCalledWith(targetUserId.toString());
  });

  it('formats history with added/removed golfers', async () => {
    const histGolferId = new ObjectId();
    const user = {
      _id: targetUserId,
      firstName: 'Bob',
      lastName: 'Jones',
      username: 'bob',
      createdAt: new Date('2025-01-01'),
    };
    const pick = {
      userId: targetUserId,
      golferIds: [golferId1],
      captainId: null,
      totalSpent: 10_000_000,
      season: 2025,
      createdAt: new Date('2025-01-05'),
      updatedAt: new Date(),
    };
    const golfers = [
      {
        _id: golferId1,
        firstName: 'Rory',
        lastName: 'McIlroy',
        picture: null,
        price: 12_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const pickHistory = [
      {
        userId: targetUserId,
        season: 2025,
        golferIds: [golferId1],
        totalSpent: 10_000_000,
        reason: 'transfer',
        changedAt: new Date('2025-02-01'),
      },
      {
        userId: targetUserId,
        season: 2025,
        golferIds: [histGolferId],
        totalSpent: 10_000_000,
        reason: 'initial',
        changedAt: new Date('2025-01-05'),
      },
    ];

    setupDb({
      user,
      pick,
      allPicks: [pick],
      golfers,
      pickHistory,
    });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.history).toBeInstanceOf(Array);
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(connectToDatabase).mockRejectedValue(new Error('DB error'));

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('DB error');
  });

  it('displays historical roster when gameweekRosters is present', async () => {
    const gw1Golfer = new ObjectId();
    const gw2Golfer = new ObjectId();
    const user = {
      _id: targetUserId,
      firstName: 'Ash',
      lastName: 'Brinsford',
      username: 'ash',
      createdAt: new Date('2025-01-01'),
    };
    const pick = {
      userId: targetUserId,
      golferIds: [gw2Golfer], // current team has only gw2Golfer
      captainId: gw2Golfer,
      allGolferIds: [gw1Golfer, gw2Golfer],
      gameweekRosters: {
        '1': { golferIds: [gw1Golfer], captainId: gw1Golfer },
        '2': { golferIds: [gw2Golfer], captainId: gw2Golfer },
      },
      totalSpent: 10_000_000,
      season: 2025,
      createdAt: new Date('2025-01-05'),
      updatedAt: new Date(),
    };
    // Only provide GW1 golfer — the mock find doesn't filter by $in,
    // so this ensures we see the roster selection in action
    const golfers = [
      {
        _id: gw1Golfer,
        firstName: 'GW1',
        lastName: 'Player',
        picture: null,
        price: 5_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    setupDb({
      user,
      pick,
      allPicks: [pick],
      golfers,
    });

    // Request GW1 — captainId should be gw1Golfer, not gw2Golfer
    const res = await handler(
      makeAuthEvent({
        queryStringParameters: {
          userId: targetUserId.toString(),
          date: '2025-01-04',
        },
      }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.hasTeam).toBe(true);
    expect(body.data.team.golfers).toHaveLength(1);
    expect(body.data.team.golfers[0].golfer.firstName).toBe('GW1');
    // Captain should be the GW1 captain, not the current pick captain
    expect(body.data.captainId).toBe(gw1Golfer.toString());
  });
});
