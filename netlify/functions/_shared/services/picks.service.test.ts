import { ObjectId } from 'mongodb';
import type { Db, MongoClient } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  savePicks,
  getUserPicks,
  getPickHistory,
  getTransfersThisWeek,
  cancelPendingChanges,
} from './picks.service';
import { getActiveSeason } from './seasons.service';
import type { Season } from '@shared/types/season.types';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

// Mock the seasons service used internally by picks.service
vi.mock('./seasons.service', () => ({
  getActiveSeason: vi.fn().mockResolvedValue({ id: '1', name: '2025', isActive: true }),
}));

const mockPicksCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
};

const mockHistoryCollection = {
  insertOne: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
  deleteMany: vi.fn(),
};

const mockGolfersCollection = {
  find: vi.fn(),
};

const mockSettingsCollection = {
  findOne: vi.fn(),
};

const toArrayHelper = <T>(items: T[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'picks') return mockPicksCollection;
        if (name === 'pickHistory') return mockHistoryCollection;
        if (name === 'golfers') return mockGolfersCollection;
        if (name === 'settings') return mockSettingsCollection;
        return {};
      }),
    } as unknown as Db,
    client: {} as unknown as MongoClient,
  });
  // Default: transfers open, new team creation allowed
  mockSettingsCollection.findOne.mockImplementation(({ key }: { key: string }) => {
    if (key === 'transfersOpen') return Promise.resolve({ key: 'transfersOpen', value: true });
    if (key === 'allowNewTeamCreation')
      return Promise.resolve({ key: 'allowNewTeamCreation', value: true });
    if (key === 'maxTransfersPerWeek')
      return Promise.resolve({ key: 'maxTransfersPerWeek', value: 1 });
    if (key === 'maxPlayersPerTransfer')
      return Promise.resolve({ key: 'maxPlayersPerTransfer', value: 6 });
    return Promise.resolve(null);
  });
});

describe('picks.service', () => {
  const userId = new ObjectId();
  const golferIds = Array.from({ length: 6 }, () => new ObjectId());
  const golferIdStrings = golferIds.map((id) => id.toString());

  const makeGolferDocs = (prices: number[]) =>
    golferIds.map((id, i) => ({
      _id: id,
      firstName: `Golfer`,
      lastName: `${i + 1}`,
      price: prices[i] ?? 5_000_000,
      isActive: true,
    }));

  describe('savePicks', () => {
    it('saves picks for a new team (initial pick)', async () => {
      // No existing pick
      mockPicksCollection.findOne.mockResolvedValue(null);
      // Golfers within budget
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          makeGolferDocs([5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000])
        )
      );
      mockHistoryCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      // getUserPicks is called at the end to return the saved pick
      const pickDoc = {
        _id: new ObjectId(),
        userId,
        golferIds: golferIds.map((id) => new ObjectId(id)),
        captainId: null,
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // First findOne for existingPick = null, then getUserPicks returns the saved pick
      mockPicksCollection.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(pickDoc);

      const result = await savePicks(userId.toString(), golferIdStrings);

      expect(result).toBeDefined();
      expect(mockHistoryCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Initial pick' })
      );
    });

    it('rejects when not exactly 6 golfers', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);

      await expect(savePicks(userId.toString(), golferIdStrings.slice(0, 5))).rejects.toThrow(
        'You must select exactly 6 golfers'
      );
    });

    it('rejects duplicate golfers', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      const dupes = [...golferIdStrings.slice(0, 5), golferIdStrings[0]];

      await expect(savePicks(userId.toString(), dupes)).rejects.toThrow(
        'Duplicate golfers are not allowed'
      );
    });

    it('rejects when budget exceeded ($50M cap)', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      // Each golfer costs $10M = $60M total > $50M cap
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          makeGolferDocs([10_000_000, 10_000_000, 10_000_000, 10_000_000, 10_000_000, 10_000_000])
        )
      );

      await expect(savePicks(userId.toString(), golferIdStrings)).rejects.toThrow(
        'Budget exceeded'
      );
    });

    it('rejects when a golfer not found', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      // Return only 5 golfers when we asked for 6
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          makeGolferDocs([5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000]).slice(0, 5)
        )
      );

      await expect(savePicks(userId.toString(), golferIdStrings)).rejects.toThrow(
        'One or more golfers not found'
      );
    });

    it('rejects when captain is not in selected golfers', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          makeGolferDocs([5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000])
        )
      );

      const invalidCaptain = new ObjectId().toString();
      await expect(
        savePicks(userId.toString(), golferIdStrings, 'Team selection', invalidCaptain)
      ).rejects.toThrow('Captain must be one of your selected golfers');
    });

    it('rejects when new team creation is disabled', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      mockSettingsCollection.findOne.mockImplementation(({ key }: { key: string }) => {
        if (key === 'allowNewTeamCreation')
          return Promise.resolve({ key: 'allowNewTeamCreation', value: false });
        return Promise.resolve(null);
      });

      await expect(savePicks(userId.toString(), golferIdStrings)).rejects.toThrow(
        'New team creation is currently disabled'
      );
    });

    it('uses explicit season parameter for savePicks', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          makeGolferDocs([5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000])
        )
      );
      mockHistoryCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const pickDoc = {
        _id: new ObjectId(),
        userId,
        golferIds: golferIds.map((id) => new ObjectId(id)),
        captainId: null,
        totalSpent: 30_000_000,
        season: 2026,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPicksCollection.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(pickDoc);

      const result = await savePicks(
        userId.toString(),
        golferIdStrings,
        'Team selection',
        null,
        2026
      );

      expect(result).toBeDefined();
      expect(mockHistoryCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ season: 2026 })
      );
    });

    it('rejects transfer when transfers are locked', async () => {
      // Existing pick exists
      const existingPick = {
        _id: new ObjectId(),
        userId,
        golferIds: golferIds.map((id) => new ObjectId(id)),
        captainId: null,
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date(),
      };
      mockPicksCollection.findOne.mockResolvedValue(existingPick);
      mockSettingsCollection.findOne.mockImplementation(({ key }: { key: string }) => {
        if (key === 'transfersOpen') return Promise.resolve({ key: 'transfersOpen', value: false });
        return Promise.resolve(null);
      });

      // Try to change golfers (not just captain)
      const newGolferIds = [...golferIdStrings.slice(1), new ObjectId().toString()];
      await expect(savePicks(userId.toString(), newGolferIds)).rejects.toThrow(
        'Transfers are currently locked'
      );
    });

    describe('unlimited transfers before first gameweek', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it('allows unlimited transfers when before firstGameweekStart', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

        // Season started Mar 1, GW1 starts Apr 3 — we're April 1 (before GW1)
        vi.mocked(getActiveSeason).mockResolvedValue({
          id: '1',
          name: '2026',
          startDate: new Date('2026-03-01'),
          firstGameweekStart: new Date('2026-04-03T08:00:00Z'),
          isActive: true,
        } as unknown as Season);

        // Existing pick (team created in the past, effective start has passed)
        const existingPick = {
          _id: new ObjectId(),
          userId,
          golferIds: golferIds.map((id) => new ObjectId(id)),
          captainId: null,
          totalSpent: 30_000_000,
          season: 2026,
          createdAt: new Date('2026-03-15'),
          updatedAt: new Date('2026-03-15'),
        };
        // First call: getUserPicks returns existing pick; second: returns updated pick
        mockPicksCollection.findOne
          .mockResolvedValueOnce(existingPick)
          .mockResolvedValueOnce(existingPick);

        // Transfer already used this week — normally would be rejected
        mockHistoryCollection.countDocuments.mockResolvedValue(1);

        // New golfers (different from existing to trigger transfer validation)
        const newGolferIds = Array.from({ length: 6 }, () => new ObjectId());
        const newGolferIdStrings = newGolferIds.map((id) => id.toString());
        mockGolfersCollection.find.mockReturnValue(
          toArrayHelper(
            newGolferIds.map((id, i) => ({
              _id: id,
              firstName: `Golfer`,
              lastName: `${i + 1}`,
              price: 5_000_000,
              isActive: true,
            }))
          )
        );
        mockHistoryCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
        mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

        // Should succeed despite transfer count >= max (because pre-GW1 = unlimited)
        const result = await savePicks(
          userId.toString(),
          newGolferIdStrings,
          'Transfer',
          null,
          2026
        );
        expect(result).toBeDefined();
      });

      it('enforces transfer limit after firstGameweekStart', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-05T12:00:00Z'));

        // Season started Mar 1, GW1 started Apr 3 — we're April 5 (after GW1)
        vi.mocked(getActiveSeason).mockResolvedValue({
          id: '1',
          name: '2026',
          startDate: new Date('2026-03-01'),
          firstGameweekStart: new Date('2026-04-03T08:00:00Z'),
          isActive: true,
        } as unknown as Season);

        // Existing pick (team created well in the past)
        const existingPick = {
          _id: new ObjectId(),
          userId,
          golferIds: golferIds.map((id) => new ObjectId(id)),
          captainId: null,
          totalSpent: 30_000_000,
          season: 2026,
          createdAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-01'),
        };
        mockPicksCollection.findOne.mockResolvedValue(existingPick);

        // Transfer already used this week
        mockHistoryCollection.countDocuments.mockResolvedValue(1);

        // Different golfers to trigger transfer validation
        const newGolferIds = [...golferIdStrings.slice(1), new ObjectId().toString()];

        await expect(
          savePicks(userId.toString(), newGolferIds, 'Transfer', null, 2026)
        ).rejects.toThrow('Transfer limit reached');
      });
    });
  });

  describe('getUserPicks', () => {
    it('returns null when no pick exists', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      const result = await getUserPicks(userId.toString());
      expect(result).toBeNull();
    });

    it('returns mapped pick when found', async () => {
      const pickDoc = {
        _id: new ObjectId(),
        userId,
        golferIds: golferIds.map((id) => new ObjectId(id)),
        captainId: null,
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPicksCollection.findOne.mockResolvedValue(pickDoc);

      const result = await getUserPicks(userId.toString());

      expect(result).toBeDefined();
      expect(result!.golferIds).toHaveLength(6);
    });

    it('uses explicit season parameter and skips getCurrentSeason lookup', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);

      const result = await getUserPicks(userId.toString(), 2026);

      expect(result).toBeNull();
      expect(mockPicksCollection.findOne).toHaveBeenCalledWith({
        userId: new ObjectId(userId.toString()),
        season: 2026,
      });
    });
  });

  describe('getTransfersThisWeek', () => {
    it('returns count of transfers since week start', async () => {
      mockHistoryCollection.countDocuments.mockResolvedValue(2);

      const result = await getTransfersThisWeek(userId.toString());

      expect(result).toBe(2);
      expect(mockHistoryCollection.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: { $nin: ['Initial pick', 'Captain change', 'Scheduled captain change'] },
        })
      );
    });
  });

  describe('getPickHistory', () => {
    it('returns sorted pick history', async () => {
      const historyDoc = {
        _id: new ObjectId(),
        userId,
        golferIds: golferIds.map((id) => new ObjectId(id)),
        totalSpent: 30_000_000,
        season: 2025,
        changedAt: new Date(),
        reason: 'Transfer',
      };
      mockHistoryCollection.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([historyDoc]) }),
      });

      const result = await getPickHistory(userId.toString());

      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe('Transfer');
    });
  });

  describe('cancelPendingChanges', () => {
    it('clears pending fields and deletes scheduled history entries', async () => {
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockHistoryCollection.deleteMany.mockResolvedValue({ deletedCount: 1 });

      await cancelPendingChanges(userId.toString());

      // Should clear pending fields on the picks document
      expect(mockPicksCollection.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ userId: expect.any(ObjectId) }),
        expect.objectContaining({
          $unset: { pendingGolferIds: '', pendingCaptainId: '', pendingChangedAt: '' },
        })
      );

      // Should delete scheduled history entries for the current week
      expect(mockHistoryCollection.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: expect.any(ObjectId),
          reason: { $in: ['Scheduled transfer', 'Scheduled captain change'] },
          changedAt: expect.objectContaining({ $gte: expect.any(Date) }),
        })
      );
    });
  });
});
