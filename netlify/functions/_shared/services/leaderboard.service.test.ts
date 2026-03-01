import { ObjectId } from 'mongodb';
import type { Db, MongoClient } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  getLeaderboard,
  getFullLeaderboard,
  getTournamentLeaderboard,
  invalidateLeaderboardCache,
} from './leaderboard.service';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisKeys = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('./seasons.service', () => ({
  getActiveSeason: vi.fn().mockResolvedValue({ id: '1', name: '2025', isActive: true }),
}));

vi.mock('../rateLimit', () => ({
  getRedisClient: vi.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    keys: mockRedisKeys,
    del: mockRedisDel,
  })),
  getRedisKeyPrefix: vi.fn(() => 'test:'),
}));

const mockTournamentsCollection = { find: vi.fn(), findOne: vi.fn() };
const mockPicksCollection = { aggregate: vi.fn() };
const mockUsersCollection = { find: vi.fn() };

const chainHelper = <T>(items: T[]) => {
  const terminal = { toArray: vi.fn().mockResolvedValue(items) };
  return {
    ...terminal,
    project: vi.fn().mockReturnValue(terminal),
  };
};

const aggregateHelper = <T>(items: T[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue('OK');
  mockRedisKeys.mockResolvedValue([]);
  mockRedisDel.mockResolvedValue(0);
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'users') return mockUsersCollection;
        if (name === 'picks') return mockPicksCollection;
        if (name === 'tournaments') return mockTournamentsCollection;
        return {};
      }),
    } as unknown as Db,
    client: {} as unknown as MongoClient,
  });
});

describe('leaderboard.service', () => {
  describe('getLeaderboard', () => {
    it('returns empty leaderboard when no users', async () => {
      mockTournamentsCollection.find.mockReturnValue(chainHelper([]));
      mockPicksCollection.aggregate.mockReturnValue(aggregateHelper([]));
      mockUsersCollection.find.mockReturnValue(chainHelper([]));

      const result = await getLeaderboard();

      expect(result).toEqual([]);
    });

    it('uses explicit season parameter and skips getCurrentSeason lookup', async () => {
      mockTournamentsCollection.find.mockReturnValue(chainHelper([]));
      mockPicksCollection.aggregate.mockReturnValue(aggregateHelper([]));
      mockUsersCollection.find.mockReturnValue(chainHelper([]));

      const result = await getLeaderboard(2026);

      expect(result).toEqual([]);
      expect(mockTournamentsCollection.find).toHaveBeenCalledWith(
        expect.objectContaining({ season: 2026 })
      );
      expect(mockPicksCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ $match: { season: 2026 } })])
      );
    });

    it('ranks users by total points descending', async () => {
      const user1 = new ObjectId();
      const user2 = new ObjectId();
      const golfer1 = new ObjectId();
      const golfer2 = new ObjectId();
      const tournamentId = new ObjectId();

      mockTournamentsCollection.find.mockReturnValue(
        chainHelper([{ _id: tournamentId, startDate: new Date('2025-05-01') }])
      );

      // Aggregation returns picks joined with scores and user data
      mockPicksCollection.aggregate.mockReturnValue(
        aggregateHelper([
          {
            userId: user1,
            captainId: null,
            createdAt: new Date('2024-01-01'),
            scores: [{ golferId: golfer1, tournamentId, multipliedPoints: 20 }],
            user: { _id: user1, username: 'alice' },
          },
          {
            userId: user2,
            captainId: null,
            createdAt: new Date('2024-01-01'),
            scores: [{ golferId: golfer2, tournamentId, multipliedPoints: 10 }],
            user: { _id: user2, username: 'bob' },
          },
        ])
      );

      mockUsersCollection.find.mockReturnValue(chainHelper([]));

      const result = await getLeaderboard();

      expect(result).toHaveLength(2);
      expect(result[0].username).toBe('alice');
      expect(result[0].totalPoints).toBe(20);
      expect(result[0].rank).toBe(1);
      expect(result[1].username).toBe('bob');
      expect(result[1].rank).toBe(2);
    });

    it('handles ties with same rank', async () => {
      const user1 = new ObjectId();
      const user2 = new ObjectId();
      const golfer1 = new ObjectId();
      const golfer2 = new ObjectId();
      const tournamentId = new ObjectId();

      mockTournamentsCollection.find.mockReturnValue(
        chainHelper([{ _id: tournamentId, startDate: new Date('2025-05-01') }])
      );

      mockPicksCollection.aggregate.mockReturnValue(
        aggregateHelper([
          {
            userId: user1,
            captainId: null,
            createdAt: new Date('2024-01-01'),
            scores: [{ golferId: golfer1, tournamentId, multipliedPoints: 15 }],
            user: { _id: user1, username: 'alice' },
          },
          {
            userId: user2,
            captainId: null,
            createdAt: new Date('2024-01-01'),
            scores: [{ golferId: golfer2, tournamentId, multipliedPoints: 15 }],
            user: { _id: user2, username: 'bob' },
          },
        ])
      );

      mockUsersCollection.find.mockReturnValue(chainHelper([]));

      const result = await getLeaderboard();

      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(1);
    });

    it('gives zero points to users without picks', async () => {
      const user1 = new ObjectId();

      mockTournamentsCollection.find.mockReturnValue(chainHelper([]));
      mockPicksCollection.aggregate.mockReturnValue(aggregateHelper([]));
      mockUsersCollection.find.mockReturnValue(
        chainHelper([{ _id: user1, username: 'alice' }])
      );

      const result = await getLeaderboard();

      expect(result[0].totalPoints).toBe(0);
    });
  });

  describe('getFullLeaderboard', () => {
    it('returns empty leaderboards when no picks exist', async () => {
      mockTournamentsCollection.find.mockReturnValue(chainHelper([]));
      mockPicksCollection.aggregate.mockReturnValue(aggregateHelper([]));

      const result = await getFullLeaderboard();

      expect(result.season).toEqual([]);
      expect(result.month).toEqual([]);
      expect(result.week).toEqual([]);
      expect(result.currentMonth).toBeDefined();
    });

    it('uses explicit season parameter and skips getCurrentSeason lookup', async () => {
      mockTournamentsCollection.find.mockReturnValue(chainHelper([]));
      mockPicksCollection.aggregate.mockReturnValue(aggregateHelper([]));

      const result = await getFullLeaderboard(2026);

      expect(result.season).toEqual([]);
      expect(mockTournamentsCollection.find).toHaveBeenCalledWith(
        expect.objectContaining({ season: 2026 })
      );
    });

    it('calculates captain multiplier (2x) for captain golfer', async () => {
      const user1 = new ObjectId();
      const golfer1 = new ObjectId();
      const golfer2 = new ObjectId();
      const tournamentId = new ObjectId();

      // Use a date within the current month so it counts for season/month/week
      const now = new Date();
      const tournamentDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        Math.min(now.getDate(), 28)
      );

      mockTournamentsCollection.find.mockReturnValue(
        chainHelper([{ _id: tournamentId, startDate: tournamentDate }])
      );

      // Aggregation returns pick with joined scores and user data
      mockPicksCollection.aggregate.mockReturnValue(
        aggregateHelper([
          {
            userId: user1,
            captainId: golfer1,
            createdAt: new Date('2024-01-01'),
            totalSpent: 20_000_000,
            scores: [
              { golferId: golfer1, tournamentId, multipliedPoints: 10, participated: true },
              { golferId: golfer2, tournamentId, multipliedPoints: 10, participated: true },
            ],
            user: { _id: user1, username: 'alice', firstName: 'Alice', lastName: 'A' },
          },
        ])
      );

      const result = await getFullLeaderboard();

      // Captain golfer1 gets 10*2=20, golfer2 gets 10*1=10, total = 30
      expect(result.season[0].points).toBe(30);
    });
  });

  describe('getTournamentLeaderboard', () => {
    it('uses explicit season parameter', async () => {
      const tournamentId = new ObjectId();

      mockTournamentsCollection.findOne.mockResolvedValue({
        _id: tournamentId,
        status: 'published',
        season: 2026,
        startDate: new Date('2026-05-01'),
      });
      mockPicksCollection.aggregate.mockReturnValue(aggregateHelper([]));
      mockUsersCollection.find.mockReturnValue(chainHelper([]));

      const result = await getTournamentLeaderboard(tournamentId.toString(), 2026);

      expect(result).toEqual([]);
      expect(mockPicksCollection.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ $match: { season: 2026 } })])
      );
    });
  });

  describe('caching', () => {
    it('returns cached data for getLeaderboard without DB queries', async () => {
      const cachedData = [
        { userId: '1', username: 'alice', totalPoints: 20, rank: 1 },
      ];
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedData));

      const result = await getLeaderboard(2025);

      expect(result).toEqual(cachedData);
      expect(connectToDatabase).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith('test:v1:cache:leaderboard:simple:2025');
    });

    it('returns cached data for getFullLeaderboard without DB queries', async () => {
      const cachedData = {
        season: [],
        month: [],
        week: [],
        currentMonth: 'July 2025',
        weekStart: '2025-07-01T00:00:00.000Z',
        weekEnd: '2025-07-07T00:00:00.000Z',
      };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedData));

      const result = await getFullLeaderboard(2025);

      expect(result).toEqual(cachedData);
      expect(connectToDatabase).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith('test:v1:cache:leaderboard:full:2025');
    });

    it('returns cached data for getTournamentLeaderboard without DB queries', async () => {
      const cachedData = [
        { userId: '1', username: 'alice', totalPoints: 10, rank: 1 },
      ];
      const tid = new ObjectId();
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedData));

      const result = await getTournamentLeaderboard(tid.toString(), 2025);

      expect(result).toEqual(cachedData);
      expect(connectToDatabase).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith(
        `test:v1:cache:leaderboard:tournament:2025:${tid.toString()}`
      );
    });

    it('caches result on cache miss for getLeaderboard', async () => {
      mockTournamentsCollection.find.mockReturnValue(chainHelper([]));
      mockPicksCollection.aggregate.mockReturnValue(aggregateHelper([]));
      mockUsersCollection.find.mockReturnValue(chainHelper([]));

      await getLeaderboard(2025);

      expect(mockRedisSet).toHaveBeenCalledWith(
        'test:v1:cache:leaderboard:simple:2025',
        expect.any(String),
        'EX',
        60
      );
    });

    it('invalidateLeaderboardCache deletes matching keys', async () => {
      const keys = [
        'test:v1:cache:leaderboard:full:2025',
        'test:v1:cache:leaderboard:simple:2025',
      ];
      mockRedisKeys.mockResolvedValue(keys);

      await invalidateLeaderboardCache(2025);

      expect(mockRedisKeys).toHaveBeenCalledWith('test:v1:cache:leaderboard:*:2025*');
      expect(mockRedisDel).toHaveBeenCalledWith(...keys);
    });

    it('invalidateLeaderboardCache does nothing when no keys match', async () => {
      mockRedisKeys.mockResolvedValue([]);

      await invalidateLeaderboardCache(2025);

      expect(mockRedisDel).not.toHaveBeenCalled();
    });
  });
});
