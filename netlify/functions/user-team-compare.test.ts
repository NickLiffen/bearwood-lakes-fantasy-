import { ObjectId } from 'mongodb';
import { handler } from './user-team-compare';
import { makeAuthEvent, mockContext, parseBody, createMockDb, mockCursor } from './__test-utils__';
import { connectToDatabase } from './_shared/db';
import { getActiveSeason } from './_shared/services/seasons.service';
import type { Season } from '@shared/types';

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
}));
vi.mock('./_shared/auth', () => ({
  verifyToken: mockVerifyToken,
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

vi.mock('./_shared/db', () => ({ connectToDatabase: vi.fn() }));
vi.mock('./_shared/services/seasons.service', () => ({ getActiveSeason: vi.fn() }));
vi.mock('./_shared/utils/dates', () => ({
  getWeekStart: vi.fn().mockReturnValue(new Date('2025-06-07')),
  getWeekEnd: vi.fn().mockReturnValue(new Date('2025-06-13T23:59:59.999Z')),
  getMonthStart: vi.fn().mockReturnValue(new Date('2025-06-01')),
  getMonthEnd: vi.fn().mockReturnValue(new Date('2025-06-30T23:59:59.999Z')),
  getTeamEffectiveStartDate: vi.fn().mockImplementation((d: Date) => new Date(d)),
}));

const mockSeason = {
  _id: 'season-1',
  name: '2025',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  isActive: true,
};

const currentUserId = new ObjectId();
const targetUserId = new ObjectId();
const sharedGolferId = new ObjectId();
const currentOnlyGolferId = new ObjectId();
const targetOnlyGolferId = new ObjectId();
const tournamentId = new ObjectId();

function setupDb(overrides: {
  currentUser?: Record<string, unknown>;
  targetUser?: Record<string, unknown>;
  currentPick?: Record<string, unknown>;
  targetPick?: Record<string, unknown>;
  golfers?: Record<string, unknown>[];
  tournaments?: Record<string, unknown>[];
  scores?: Record<string, unknown>[];
} = {}) {
  const usersMap = new Map<string, Record<string, unknown>>();
  if (overrides.currentUser) usersMap.set(currentUserId.toString(), overrides.currentUser);
  if (overrides.targetUser) usersMap.set(targetUserId.toString(), overrides.targetUser);

  const picksMap = new Map<string, Record<string, unknown>>();
  if (overrides.currentPick) picksMap.set(currentUserId.toString(), overrides.currentPick);
  if (overrides.targetPick) picksMap.set(targetUserId.toString(), overrides.targetPick);

  const { mockDb } = createMockDb({
    users: {
      findOne: vi.fn().mockImplementation(({ _id }: { _id: ObjectId }) =>
        Promise.resolve(usersMap.get(_id.toString()) ?? null),
      ),
    },
    picks: {
      findOne: vi.fn().mockImplementation(({ userId }: { userId: ObjectId }) =>
        Promise.resolve(picksMap.get(userId.toString()) ?? null),
      ),
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
  });

  vi.mocked(connectToDatabase).mockResolvedValue(mockDb);
  return mockDb;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveSeason).mockResolvedValue(mockSeason as unknown as Season);
  mockVerifyToken.mockReturnValue({
    userId: currentUserId.toString(),
    username: 'testplayer',
    role: 'player',
    phoneVerified: true,
  });
});

describe('user-team-compare handler', () => {
  it('returns 400 when userId is missing', async () => {
    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.error).toBe('userId is required');
  });

  it('returns 400 for invalid userId format', async () => {
    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: 'bad-id' } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.error).toBe('Invalid userId format');
  });

  it('returns 404 when target user not found', async () => {
    setupDb({
      currentUser: {
        _id: currentUserId,
        firstName: 'Me',
        lastName: 'Player',
        username: 'me',
      },
      targetUser: null,
    });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(404);
    expect(body.error).toBe('User not found');
  });

  it('returns comparison with shared and unique golfers', async () => {
    const currentUser = {
      _id: currentUserId,
      firstName: 'Alice',
      lastName: 'A',
      username: 'alice',
    };
    const targetUser = {
      _id: targetUserId,
      firstName: 'Bob',
      lastName: 'B',
      username: 'bob',
    };
    const currentPick = {
      userId: currentUserId,
      golferIds: [sharedGolferId, currentOnlyGolferId],
      captainId: null,
      totalSpent: 20_000_000,
      season: 2025,
      createdAt: new Date('2025-01-05'),
    };
    const targetPick = {
      userId: targetUserId,
      golferIds: [sharedGolferId, targetOnlyGolferId],
      captainId: null,
      totalSpent: 18_000_000,
      season: 2025,
      createdAt: new Date('2025-01-06'),
    };
    const golfers = [
      {
        _id: sharedGolferId,
        firstName: 'Rory',
        lastName: 'McIlroy',
        picture: null,
        price: 12_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: currentOnlyGolferId,
        firstName: 'Tiger',
        lastName: 'Woods',
        picture: null,
        price: 10_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: targetOnlyGolferId,
        firstName: 'Jon',
        lastName: 'Rahm',
        picture: null,
        price: 8_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const tournamentDate = new Date('2025-06-10');
    const tournaments = [{
      _id: tournamentId,
      name: 'US Open',
      status: 'published',
      season: 2025,
      startDate: tournamentDate,
    }];
    const scores = [
      { golferId: sharedGolferId, tournamentId, multipliedPoints: 50, participated: true },
      { golferId: currentOnlyGolferId, tournamentId, multipliedPoints: 30, participated: true },
      { golferId: targetOnlyGolferId, tournamentId, multipliedPoints: 20, participated: true },
    ];

    setupDb({
      currentUser,
      targetUser,
      currentPick,
      targetPick,
      golfers,
      tournaments,
      scores,
    });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);

    // Team summaries
    expect(body.data.currentUser.username).toBe('alice');
    expect(body.data.currentUser.hasTeam).toBe(true);
    expect(body.data.targetUser.username).toBe('bob');
    expect(body.data.targetUser.hasTeam).toBe(true);

    // Comparison structure
    expect(body.data.comparison.sharedGolferCount).toBe(1);
    expect(body.data.comparison.sharedGolfers).toHaveLength(1);
    expect(body.data.comparison.uniqueToCurrent).toHaveLength(1);
    expect(body.data.comparison.uniqueToTarget).toHaveLength(1);

    // Points diff
    expect(body.data.comparison.pointsDiff).toHaveProperty('week');
    expect(body.data.comparison.pointsDiff).toHaveProperty('month');
    expect(body.data.comparison.pointsDiff).toHaveProperty('season');
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(connectToDatabase).mockRejectedValue(new Error('Connection lost'));

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Connection lost');
  });

  it('applies captain 2x multiplier to team golfer totals', async () => {
    const captainGolferId = new ObjectId();
    const normalGolferId = new ObjectId();
    const tid = new ObjectId();

    setupDb({
      currentUser: { _id: currentUserId, firstName: 'Alice', lastName: 'A', username: 'alice' },
      targetUser: { _id: targetUserId, firstName: 'Bob', lastName: 'B', username: 'bob' },
      currentPick: {
        userId: currentUserId,
        golferIds: [captainGolferId, normalGolferId],
        captainId: captainGolferId,
        totalSpent: 20_000_000,
        season: 2025,
        createdAt: new Date('2025-01-01'),
      },
      targetPick: {
        userId: targetUserId,
        golferIds: [captainGolferId],
        captainId: null,
        totalSpent: 10_000_000,
        season: 2025,
        createdAt: new Date('2025-01-01'),
      },
      golfers: [
        { _id: captainGolferId, firstName: 'Rory', lastName: 'M', picture: null, price: 10_000_000, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { _id: normalGolferId, firstName: 'Tiger', lastName: 'W', picture: null, price: 8_000_000, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ],
      tournaments: [{ _id: tid, name: 'Open', status: 'published', season: 2025, startDate: new Date('2025-06-10') }],
      scores: [
        { golferId: captainGolferId, tournamentId: tid, multipliedPoints: 10, participated: true },
        { golferId: normalGolferId, tournamentId: tid, multipliedPoints: 10, participated: true },
      ],
    });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    // Current user: captain (10*2=20) + normal (10*1=10) = 30
    expect(body.data.currentUser.totals.weekPoints).toBe(30);
    // Target user: no captain (10*1=10)
    expect(body.data.targetUser.totals.weekPoints).toBe(10);
  });

  it('excludes tournaments before team effective start date', async () => {
    const gid = new ObjectId();
    const earlyTournament = new ObjectId();
    const lateTournament = new ObjectId();

    // Mock getTeamEffectiveStartDate to return June 8 for a team created June 5
    const { getTeamEffectiveStartDate } = await import('./_shared/utils/dates');
    vi.mocked(getTeamEffectiveStartDate).mockImplementation(() => new Date('2025-06-08'));

    setupDb({
      currentUser: { _id: currentUserId, firstName: 'Alice', lastName: 'A', username: 'alice' },
      targetUser: { _id: targetUserId, firstName: 'Bob', lastName: 'B', username: 'bob' },
      currentPick: {
        userId: currentUserId,
        golferIds: [gid],
        captainId: null,
        totalSpent: 10_000_000,
        season: 2025,
        createdAt: new Date('2025-06-05'),
      },
      targetPick: null,
      golfers: [
        { _id: gid, firstName: 'Rory', lastName: 'M', picture: null, price: 10_000_000, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ],
      tournaments: [
        { _id: earlyTournament, name: 'Early', status: 'published', season: 2025, startDate: new Date('2025-06-07') },
        { _id: lateTournament, name: 'Late', status: 'published', season: 2025, startDate: new Date('2025-06-10') },
      ],
      scores: [
        { golferId: gid, tournamentId: earlyTournament, multipliedPoints: 100, participated: true },
        { golferId: gid, tournamentId: lateTournament, multipliedPoints: 15, participated: true },
      ],
    });

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { userId: targetUserId.toString() } }),
      mockContext,
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    // Only lateTournament (15) counts; earlyTournament (100) is before effective start
    expect(body.data.currentUser.totals.seasonPoints).toBe(15);
  });
});
