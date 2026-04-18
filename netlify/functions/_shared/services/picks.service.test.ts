import { ObjectId } from 'mongodb';
import type { Db, MongoClient } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  savePicks,
  getUserPicks,
  getPickHistory,
  getTransfersThisWeek,
  cancelPendingChanges,
  applyPendingChanges,
  applyAllPendingChanges,
} from './picks.service';
import { getActiveSeason } from './seasons.service';
import type { Season } from '@shared/types/season.types';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

// Mock the seasons service used internally by picks.service.
// IMPORTANT: include startDate + firstGameweekStart. Historically this mock
// returned only { id, name, isActive } which caused picks.service → dates.ts →
// getSeasonFirstSaturday to hit an Invalid Date and loop forever, hanging the
// entire vitest worker pool.
vi.mock('./seasons.service', () => ({
  getActiveSeason: vi.fn().mockResolvedValue({
    id: '1',
    name: '2025',
    startDate: new Date('2025-04-01T00:00:00Z'),
    endDate: new Date('2026-03-30T23:59:59Z'),
    firstGameweekStart: new Date('2025-04-05T00:00:00Z'),
    isActive: true,
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  }),
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

    // Regression tests for the "no-captain" bug class on the IMMEDIATE save path.
    // savePicks used to write captainId:null whenever captainId arg was undefined
    // or null — initial team creation and unlimited-transfers saves could both
    // leave a team with no captain. These guard against re-introducing that.

    it('auto-assigns first golfer as captainId on initial pick when captainId is undefined', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          makeGolferDocs([5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000])
        )
      );
      mockHistoryCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await savePicks(userId.toString(), golferIdStrings);

      const updateCall = mockPicksCollection.updateOne.mock.calls[0];
      const $set = updateCall[1].$set;
      // Captain must be set to the first golfer — never null on a non-empty team.
      expect($set.captainId).not.toBeNull();
      expect($set.captainId.toString()).toBe(golferIdStrings[0]);
      const rosterKey = Object.keys($set).find((k) => k.startsWith('gameweekRosters.'));
      expect($set[rosterKey!].captainId.toString()).toBe(golferIdStrings[0]);
    });

    it('preserves existing captain on unlimited-transfer save when captainId is undefined and captain still on team', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

      vi.mocked(getActiveSeason).mockResolvedValue({
        id: '1',
        name: '2026',
        startDate: new Date('2026-03-01'),
        firstGameweekStart: new Date('2026-04-03T08:00:00Z'),
        isActive: true,
      } as unknown as Season);

      // Existing pick with a real captain — captain IS in the new golfer list
      const existingPick = {
        _id: new ObjectId(),
        userId,
        golferIds: golferIds.map((id) => new ObjectId(id)),
        captainId: new ObjectId(golferIdStrings[2]),
        totalSpent: 30_000_000,
        season: 2026,
        createdAt: new Date('2026-03-15'),
        updatedAt: new Date('2026-03-15'),
      };
      mockPicksCollection.findOne
        .mockResolvedValueOnce(existingPick)
        .mockResolvedValueOnce(existingPick);

      // Transfer: replace golfer at index 5 with a new one; keep captain (index 2)
      const newGolferIds = [...golferIdStrings.slice(0, 5), new ObjectId().toString()];
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          newGolferIds.map((id, i) => ({
            _id: new ObjectId(id),
            firstName: `G`,
            lastName: `${i}`,
            price: 5_000_000,
            isActive: true,
          }))
        )
      );
      mockHistoryCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      // Call without captainId (undefined)
      await savePicks(userId.toString(), newGolferIds, 'Transfer', undefined, 2026);

      const $set = mockPicksCollection.updateOne.mock.calls[0][1].$set;
      // Must preserve existing captain at index 2 — NOT null, NOT index 0
      expect($set.captainId).not.toBeNull();
      expect($set.captainId.toString()).toBe(golferIdStrings[2]);
    });

    it('auto-assigns first golfer on unlimited-transfer save when captainId is null and previous captain was transferred out', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

      vi.mocked(getActiveSeason).mockResolvedValue({
        id: '1',
        name: '2026',
        startDate: new Date('2026-03-01'),
        firstGameweekStart: new Date('2026-04-03T08:00:00Z'),
        isActive: true,
      } as unknown as Season);

      const oldCaptainId = new ObjectId();
      const existingPick = {
        _id: new ObjectId(),
        userId,
        golferIds: [oldCaptainId, ...golferIds.slice(1).map((id) => new ObjectId(id))],
        captainId: oldCaptainId, // this golfer is being transferred out
        totalSpent: 30_000_000,
        season: 2026,
        createdAt: new Date('2026-03-15'),
        updatedAt: new Date('2026-03-15'),
      };
      mockPicksCollection.findOne
        .mockResolvedValueOnce(existingPick)
        .mockResolvedValueOnce(existingPick);

      // New team does NOT include oldCaptainId
      const newGolferIds = [...golferIdStrings.slice(1), new ObjectId().toString()];
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          newGolferIds.map((id, i) => ({
            _id: new ObjectId(id),
            firstName: `G`,
            lastName: `${i}`,
            price: 5_000_000,
            isActive: true,
          }))
        )
      );
      mockHistoryCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      // Client sends null captainId (legacy path) — backend must still end up
      // with a valid captain.
      await savePicks(userId.toString(), newGolferIds, 'Transfer', null, 2026);

      const $set = mockPicksCollection.updateOne.mock.calls[0][1].$set;
      expect($set.captainId).not.toBeNull();
      // Falls back to first golfer in new team
      expect($set.captainId.toString()).toBe(newGolferIds[0]);
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

  describe('applyPendingChanges', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns false when user has no pending changes', async () => {
      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds,
        captainId: null,
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date(),
        updatedAt: new Date(),
        // No pendingChangedAt
      });

      const result = await applyPendingChanges(userId.toString());
      expect(result).toBe(false);
    });

    it('applies pending changes when pendingChangedAt is before 8am Saturday (transfer deadline)', async () => {
      vi.useFakeTimers();
      // Current time: Saturday April 12 2025, 10am — well past the 8am deadline
      vi.setSystemTime(new Date(2025, 3, 12, 10, 0, 0));

      const pendingGolferIds = Array.from({ length: 6 }, () => new ObjectId());

      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds,
        captainId: null,
        pendingGolferIds,
        pendingChangedAt: new Date(2025, 3, 11, 7, 0, 0), // Friday April 11, 7am — before Saturday 8am deadline
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          pendingGolferIds.map((id, i) => ({
            _id: id,
            firstName: `New`,
            lastName: `${i + 1}`,
            price: 5_000_000,
          }))
        )
      );
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await applyPendingChanges(userId.toString());
      expect(result).toBe(true);
      expect(mockPicksCollection.updateOne).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({ golferIds: pendingGolferIds }),
          $unset: { pendingGolferIds: '', pendingCaptainId: '', pendingChangedAt: '' },
        })
      );
    });

    it('applies transfer submitted at 3am Saturday when checked at 9am same Saturday (before 8am deadline)', async () => {
      vi.useFakeTimers();
      // Current time: Saturday April 12 2025, 9am
      vi.setSystemTime(new Date(2025, 3, 12, 9, 0, 0));

      const pendingGolferIds = Array.from({ length: 6 }, () => new ObjectId());

      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds,
        captainId: null,
        pendingGolferIds,
        // Transfer submitted at 3am on this Saturday — before the 8am deadline
        pendingChangedAt: new Date(2025, 3, 12, 3, 0, 0),
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          pendingGolferIds.map((id, i) => ({
            _id: id,
            firstName: `New`,
            lastName: `${i + 1}`,
            price: 5_000_000,
          }))
        )
      );
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await applyPendingChanges(userId.toString());
      // Should apply — 3am is before the 8am deadline, so it takes effect this gameweek
      expect(result).toBe(true);
    });

    it('does NOT apply when pendingChangedAt is after 8am Saturday deadline', async () => {
      vi.useFakeTimers();
      // Current time: Saturday April 12 2025, 10am
      vi.setSystemTime(new Date(2025, 3, 12, 10, 0, 0));

      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds,
        captainId: null,
        pendingGolferIds: Array.from({ length: 6 }, () => new ObjectId()),
        // Transfer submitted at 8:30am Saturday — after the 8am deadline
        pendingChangedAt: new Date(2025, 3, 12, 8, 30, 0),
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await applyPendingChanges(userId.toString());
      // Should NOT apply — 8:30am is after the 8am deadline, deferred to next gameweek
      expect(result).toBe(false);
    });

    it('does NOT apply before 8am Saturday even with eligible pendingChangedAt', async () => {
      vi.useFakeTimers();
      // Current time: Saturday April 12 2025, 1am — before the 8am deadline
      vi.setSystemTime(new Date(2025, 3, 12, 1, 0, 0));

      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds,
        captainId: null,
        pendingGolferIds: Array.from({ length: 6 }, () => new ObjectId()),
        // Transfer submitted Friday at 2pm — would be eligible, but deadline hasn't passed
        pendingChangedAt: new Date(2025, 3, 11, 14, 0, 0),
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await applyPendingChanges(userId.toString());
      // Should NOT apply — the 8am deadline hasn't passed yet
      expect(result).toBe(false);
    });

    it('applies transfer submitted at 7:59am Saturday when checked after 8am Saturday', async () => {
      vi.useFakeTimers();
      // We are now in the NEXT week — Saturday April 19 at 10am
      vi.setSystemTime(new Date(2025, 3, 19, 10, 0, 0));

      const pendingGolferIds = Array.from({ length: 6 }, () => new ObjectId());

      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds,
        captainId: null,
        pendingGolferIds,
        // Transfer submitted at 7:59am LAST Saturday (April 12)
        pendingChangedAt: new Date(2025, 3, 12, 7, 59, 0),
        totalSpent: 30_000_000,
        season: 2025,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(
          pendingGolferIds.map((id, i) => ({
            _id: id,
            firstName: `New`,
            lastName: `${i + 1}`,
            price: 5_000_000,
          }))
        )
      );
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await applyPendingChanges(userId.toString());
      // Should apply — 7:59am is before the 8am deadline, and we're in the next week
      expect(result).toBe(true);
    });

    // Regression guards for the "no captain after apply" bug (Ed Saliba incident).
    // The frontend used to be able to POST captainId:null; the backend's apply
    // fallback only covered pendingCaptainId:undefined. See RUNBOOK.md "Captain
    // data incidents".

    it('auto-assigns first pending golfer as captain when pendingCaptainId is explicitly null and captain was transferred out', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 3, 12, 10, 0, 0));

      const currentCaptain = new ObjectId();
      const currentGolfers = [currentCaptain, ...Array.from({ length: 5 }, () => new ObjectId())];
      const pendingGolferIds = Array.from({ length: 6 }, () => new ObjectId());

      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds: currentGolfers,
        captainId: currentCaptain,
        pendingGolferIds, // captain not in this list
        pendingCaptainId: null, // EXPLICIT null — the bug case
        pendingChangedAt: new Date(2025, 3, 11, 7, 0, 0),
        totalSpent: 30_000_000,
        season: 2025,
      });

      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(pendingGolferIds.map((id) => ({ _id: id, price: 5_000_000 })))
      );
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await applyPendingChanges(userId.toString());
      expect(result).toBe(true);

      const updateCall = mockPicksCollection.updateOne.mock.calls[0];
      const $set = updateCall[1].$set;
      // captainId must be the first pending golfer — NOT null
      expect($set.captainId).toEqual(pendingGolferIds[0]);
      expect($set.captainId).not.toBeNull();
    });

    it('preserves existing captain when pendingCaptainId is explicitly null and captain is still on the team', async () => {
      // If a client somehow sends null while the user's captain is still on
      // the team, we must NOT wipe it. The safety check picks golferIds[0] only
      // when captainId ends up null; here captain should be preserved.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 3, 12, 10, 0, 0));

      const currentCaptain = new ObjectId();
      // captain is at index 2 — the safety check would pick [0] if it fired, so
      // this test validates we preserve the actual captain rather than clobber.
      const keepOnTeam = [
        new ObjectId(),
        new ObjectId(),
        currentCaptain,
        new ObjectId(),
        new ObjectId(),
      ];
      const pendingGolferIds = [...keepOnTeam, new ObjectId()];

      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds: [currentCaptain, ...Array.from({ length: 5 }, () => new ObjectId())],
        captainId: currentCaptain,
        pendingGolferIds,
        pendingCaptainId: null,
        pendingChangedAt: new Date(2025, 3, 11, 7, 0, 0),
        totalSpent: 30_000_000,
        season: 2025,
      });

      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(pendingGolferIds.map((id) => ({ _id: id, price: 5_000_000 })))
      );
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await applyPendingChanges(userId.toString());
      expect(result).toBe(true);

      const $set = mockPicksCollection.updateOne.mock.calls[0][1].$set;
      // We didn't set captainId in updateSet (no explicit change + captain still on team),
      // but the roster snapshot should keep the original captain.
      const rosterKey = Object.keys($set).find((k) => k.startsWith('gameweekRosters.'));
      expect(rosterKey).toBeDefined();
      expect($set[rosterKey!].captainId).toEqual(currentCaptain);
    });

    it('final safety check: never leaves captainId null when team has golfers (pendingCaptainId=null, no pendingGolferIds)', async () => {
      // Edge case — legacy data with captainId:null and no pending transfer.
      // Covers users who never set a captain. Safety check should assign golferIds[0].
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 3, 12, 10, 0, 0));

      mockPicksCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId,
        golferIds,
        captainId: null,
        // No pendingGolferIds. Just a null pendingCaptainId scheduled.
        pendingCaptainId: null,
        pendingChangedAt: new Date(2025, 3, 11, 7, 0, 0),
        totalSpent: 30_000_000,
        season: 2025,
      });
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await applyPendingChanges(userId.toString());
      expect(result).toBe(true);

      const $set = mockPicksCollection.updateOne.mock.calls[0][1].$set;
      // Roster snapshot should have a non-null captainId
      const rosterKey = Object.keys($set).find((k) => k.startsWith('gameweekRosters.'));
      expect($set[rosterKey!].captainId).toEqual(golferIds[0]);
      // And the top-level captainId should be set on the document
      expect($set.captainId).toEqual(golferIds[0]);
    });
  });

  describe('applyAllPendingChanges', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('applies all eligible pending transfers in bulk', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 3, 12, 10, 0, 0)); // Saturday April 12 10am

      const user1Id = new ObjectId();
      const user2Id = new ObjectId();
      const pending1 = Array.from({ length: 6 }, () => new ObjectId());
      const pending2 = Array.from({ length: 6 }, () => new ObjectId());

      const picksWithPending = [
        {
          _id: new ObjectId(),
          userId: user1Id,
          golferIds,
          captainId: null,
          pendingGolferIds: pending1,
          pendingChangedAt: new Date(2025, 3, 11, 14, 0, 0), // Friday 2pm
          totalSpent: 30_000_000,
          season: 2025,
        },
        {
          _id: new ObjectId(),
          userId: user2Id,
          golferIds,
          captainId: null,
          pendingGolferIds: pending2,
          pendingChangedAt: new Date(2025, 3, 10, 8, 0, 0), // Thursday 8am
          totalSpent: 30_000_000,
          season: 2025,
        },
      ];

      mockPicksCollection.findOne.mockResolvedValue(null);
      (mockPicksCollection as unknown as Record<string, unknown>).find = vi
        .fn()
        .mockReturnValue(toArrayHelper(picksWithPending));
      mockGolfersCollection.find.mockReturnValue({
        project: vi.fn().mockReturnValue(
          toArrayHelper(
            [...pending1, ...pending2].map((id) => ({
              _id: id,
              price: 5_000_000,
            }))
          )
        ),
        ...toArrayHelper(
          [...pending1, ...pending2].map((id) => ({
            _id: id,
            price: 5_000_000,
          }))
        ),
      });
      mockPicksCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await applyAllPendingChanges();

      expect(result.applied).toBe(2);
      expect(result.total).toBe(2);
      expect(result.details).toHaveLength(2);
    });

    it('returns zero when no picks have pending changes', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2025, 3, 12, 10, 0, 0));

      (mockPicksCollection as unknown as Record<string, unknown>).find = vi
        .fn()
        .mockReturnValue(toArrayHelper([]));

      const result = await applyAllPendingChanges();

      expect(result.applied).toBe(0);
      expect(result.total).toBe(0);
      expect(result.details).toHaveLength(0);
    });
  });
});
