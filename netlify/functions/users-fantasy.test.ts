import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
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

const {
  mockUsersCollection, mockPicksCollection, mockTournamentsCollection, mockScoresCollection,
  mockDb,
} = vi.hoisted(() => {
  const mockUsersCollection = { find: vi.fn() };
  const mockPicksCollection = { find: vi.fn() };
  const mockTournamentsCollection = { find: vi.fn() };
  const mockScoresCollection = { find: vi.fn() };

  const collectionMap: Record<string, unknown> = {
    users: mockUsersCollection,
    picks: mockPicksCollection,
    tournaments: mockTournamentsCollection,
    scores: mockScoresCollection,
  };
  const mockDb = { collection: vi.fn().mockImplementation((name: string) => collectionMap[name] || {}) };

  return { mockUsersCollection, mockPicksCollection, mockTournamentsCollection, mockScoresCollection, mockDb };
});

vi.mock('./_shared/db', () => ({
  connectToDatabase: vi.fn().mockResolvedValue({ db: mockDb, client: {} }),
}));

vi.mock('./_shared/services/seasons.service', () => ({
  getActiveSeason: vi.fn().mockResolvedValue({ name: '2024' }),
}));

vi.mock('./_shared/utils/dates', () => ({
  getWeekStart: vi.fn().mockReturnValue(new Date('2024-01-01')),
  getMonthStart: vi.fn().mockReturnValue(new Date('2024-01-01')),
  getSeasonStart: vi.fn().mockReturnValue(new Date('2024-01-01')),
  getTeamEffectiveStartDate: vi.fn().mockReturnValue(new Date('2024-01-01')),
}));

import { handler } from './users-fantasy';

// ObjectIds created after imports
const userId1 = new ObjectId();
const userId2 = new ObjectId();
const golferId1 = new ObjectId();
const golferId2 = new ObjectId();
const tournamentId1 = new ObjectId();

describe('users-fantasy handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsersCollection.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: userId1, firstName: 'Alice', lastName: 'A', username: 'alice', createdAt: new Date() },
        { _id: userId2, firstName: 'Bob', lastName: 'B', username: 'bob', createdAt: new Date() },
      ]),
    });

    mockPicksCollection.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          userId: userId1,
          golferIds: [golferId1, golferId2],
          totalSpent: 20_000_000,
          season: 2024,
          createdAt: new Date('2024-01-01'),
        },
      ]),
    });

    mockTournamentsCollection.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { _id: tournamentId1, startDate: '2024-06-01', status: 'published', season: 2024 },
      ]),
    });

    mockScoresCollection.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { golferId: golferId1, tournamentId: tournamentId1, multipliedPoints: 10 },
        { golferId: golferId2, tournamentId: tournamentId1, multipliedPoints: 5 },
      ]),
    });
  });

  it('returns users sorted by season points', async () => {
    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    // Alice has team with 15 points, should be first
    expect(body.data[0].username).toBe('alice');
    expect(body.data[0].seasonPoints).toBe(15);
    expect(body.data[0].hasTeam).toBe(true);
  });

  it('users without teams show 0 points and null ranks', async () => {
    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    const bob = body.data.find((u: { username: string }) => u.username === 'bob');
    expect(bob.seasonPoints).toBe(0);
    expect(bob.weekPoints).toBe(0);
    expect(bob.monthPoints).toBe(0);
    expect(bob.hasTeam).toBe(false);
    expect(bob.weekRank).toBeNull();
    expect(bob.monthRank).toBeNull();
    expect(bob.seasonRank).toBeNull();
  });

  it('assigns correct ranking to users with teams', async () => {
    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    const alice = body.data.find((u: { username: string }) => u.username === 'alice');
    expect(alice.seasonRank).toBe(1);
    expect(alice.weekRank).toBe(1);
    expect(alice.monthRank).toBe(1);
  });
});
