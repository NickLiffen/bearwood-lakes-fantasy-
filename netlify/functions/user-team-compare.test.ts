import { ObjectId } from 'mongodb';
import { handler } from './user-team-compare';
import { makeAuthEvent, mockContext, parseBody, createMockDb, mockCursor } from './__test-utils__';
import { connectToDatabase } from './_shared/db';
import { getActiveSeason } from './_shared/services/seasons.service';

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
  getMonthStart: vi.fn().mockReturnValue(new Date('2025-06-01')),
  getSeasonStart: vi.fn().mockReturnValue(new Date('2025-01-01')),
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
  currentUser?: any;
  targetUser?: any;
  currentPick?: any;
  targetPick?: any;
  golfers?: any[];
  tournaments?: any[];
  scores?: any[];
} = {}) {
  const usersMap = new Map<string, any>();
  if (overrides.currentUser) usersMap.set(currentUserId.toString(), overrides.currentUser);
  if (overrides.targetUser) usersMap.set(targetUserId.toString(), overrides.targetUser);

  const picksMap = new Map<string, any>();
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
  vi.mocked(getActiveSeason).mockResolvedValue(mockSeason as any);
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
});
