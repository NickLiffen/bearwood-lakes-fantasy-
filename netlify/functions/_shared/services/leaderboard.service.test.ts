import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { getLeaderboard, getFullLeaderboard } from './leaderboard.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('./seasons.service', () => ({
  getActiveSeason: vi.fn().mockResolvedValue({ id: '1', name: '2025', isActive: true }),
}));

const mockUsersCollection = { find: vi.fn() };
const mockPicksCollection = { find: vi.fn() };
const mockScoresCollection = { find: vi.fn() };
const mockTournamentsCollection = { find: vi.fn(), findOne: vi.fn() };

const toArrayHelper = (items: any[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'users') return mockUsersCollection;
        if (name === 'picks') return mockPicksCollection;
        if (name === 'scores') return mockScoresCollection;
        if (name === 'tournaments') return mockTournamentsCollection;
        return {};
      }),
    } as any,
    client: {} as any,
  });
});

describe('leaderboard.service', () => {
  describe('getLeaderboard', () => {
    it('returns empty leaderboard when no users', async () => {
      mockUsersCollection.find.mockReturnValue(toArrayHelper([]));
      mockPicksCollection.find.mockReturnValue(toArrayHelper([]));
      mockTournamentsCollection.find.mockReturnValue(toArrayHelper([]));
      mockScoresCollection.find.mockReturnValue(toArrayHelper([]));

      const result = await getLeaderboard();

      expect(result).toEqual([]);
    });

    it('ranks users by total points descending', async () => {
      const user1 = new ObjectId();
      const user2 = new ObjectId();
      const golfer1 = new ObjectId();
      const golfer2 = new ObjectId();
      const tournamentId = new ObjectId();

      mockUsersCollection.find.mockReturnValue(
        toArrayHelper([
          { _id: user1, username: 'alice', firstName: 'Alice', lastName: 'A' },
          { _id: user2, username: 'bob', firstName: 'Bob', lastName: 'B' },
        ])
      );

      // Both users created teams in the past (grandfathered)
      mockPicksCollection.find.mockReturnValue(
        toArrayHelper([
          {
            userId: user1,
            golferIds: [golfer1],
            captainId: null,
            totalSpent: 10_000_000,
            season: 2025,
            createdAt: new Date('2024-01-01'),
          },
          {
            userId: user2,
            golferIds: [golfer2],
            captainId: null,
            totalSpent: 10_000_000,
            season: 2025,
            createdAt: new Date('2024-01-01'),
          },
        ])
      );

      mockTournamentsCollection.find.mockReturnValue(
        toArrayHelper([
          {
            _id: tournamentId,
            status: 'published',
            season: 2025,
            startDate: new Date('2025-05-01'),
          },
        ])
      );

      mockScoresCollection.find.mockReturnValue(
        toArrayHelper([
          { golferId: golfer1, tournamentId, multipliedPoints: 20 },
          { golferId: golfer2, tournamentId, multipliedPoints: 10 },
        ])
      );

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

      mockUsersCollection.find.mockReturnValue(
        toArrayHelper([
          { _id: user1, username: 'alice', firstName: 'Alice', lastName: 'A' },
          { _id: user2, username: 'bob', firstName: 'Bob', lastName: 'B' },
        ])
      );

      mockPicksCollection.find.mockReturnValue(
        toArrayHelper([
          { userId: user1, golferIds: [golfer1], captainId: null, totalSpent: 10_000_000, season: 2025, createdAt: new Date('2024-01-01') },
          { userId: user2, golferIds: [golfer2], captainId: null, totalSpent: 10_000_000, season: 2025, createdAt: new Date('2024-01-01') },
        ])
      );

      mockTournamentsCollection.find.mockReturnValue(
        toArrayHelper([{ _id: tournamentId, status: 'published', season: 2025, startDate: new Date('2025-05-01') }])
      );

      // Same points = tie
      mockScoresCollection.find.mockReturnValue(
        toArrayHelper([
          { golferId: golfer1, tournamentId, multipliedPoints: 15 },
          { golferId: golfer2, tournamentId, multipliedPoints: 15 },
        ])
      );

      const result = await getLeaderboard();

      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(1);
    });

    it('gives zero points to users without picks', async () => {
      const user1 = new ObjectId();

      mockUsersCollection.find.mockReturnValue(
        toArrayHelper([{ _id: user1, username: 'alice', firstName: 'Alice', lastName: 'A' }])
      );
      mockPicksCollection.find.mockReturnValue(toArrayHelper([]));
      mockTournamentsCollection.find.mockReturnValue(toArrayHelper([]));
      mockScoresCollection.find.mockReturnValue(toArrayHelper([]));

      const result = await getLeaderboard();

      expect(result[0].totalPoints).toBe(0);
    });
  });

  describe('getFullLeaderboard', () => {
    it('returns empty leaderboards when no picks exist', async () => {
      mockPicksCollection.find.mockReturnValue(toArrayHelper([]));

      const result = await getFullLeaderboard();

      expect(result.season).toEqual([]);
      expect(result.month).toEqual([]);
      expect(result.week).toEqual([]);
      expect(result.currentMonth).toBeDefined();
    });

    it('calculates captain multiplier (2x) for captain golfer', async () => {
      const user1 = new ObjectId();
      const golfer1 = new ObjectId();
      const golfer2 = new ObjectId();
      const tournamentId = new ObjectId();

      mockPicksCollection.find.mockReturnValue(
        toArrayHelper([
          {
            userId: user1,
            golferIds: [golfer1, golfer2],
            captainId: golfer1,
            totalSpent: 20_000_000,
            season: 2025,
            createdAt: new Date('2024-01-01'),
          },
        ])
      );

      mockUsersCollection.find.mockReturnValue(
        toArrayHelper([{ _id: user1, username: 'alice', firstName: 'Alice', lastName: 'A' }])
      );

      // Use a date within the current month so it counts for season/month/week
      const now = new Date();
      const tournamentDate = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate(), 28));
      mockTournamentsCollection.find.mockReturnValue(
        toArrayHelper([
          { _id: tournamentId, status: 'published', season: 2025, startDate: tournamentDate },
        ])
      );

      mockScoresCollection.find.mockReturnValue(
        toArrayHelper([
          { golferId: golfer1, tournamentId, multipliedPoints: 10, participated: true },
          { golferId: golfer2, tournamentId, multipliedPoints: 10, participated: true },
        ])
      );

      const result = await getFullLeaderboard();

      // Captain golfer1 gets 10*2=20, golfer2 gets 10*1=10, total = 30
      expect(result.season[0].points).toBe(30);
    });
  });
});
