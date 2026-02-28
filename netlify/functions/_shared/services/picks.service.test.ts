import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { savePicks, getUserPicks, getPickHistory, getTransfersThisWeek } from './picks.service';

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
};

const mockGolfersCollection = {
  find: vi.fn(),
};

const mockSettingsCollection = {
  findOne: vi.fn(),
};

const toArrayHelper = (items: any[]) => ({
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
    } as any,
    client: {} as any,
  });
  // Default: transfers open, new team creation allowed
  mockSettingsCollection.findOne.mockImplementation(({ key }: { key: string }) => {
    if (key === 'transfersOpen') return Promise.resolve({ key: 'transfersOpen', value: true });
    if (key === 'allowNewTeamCreation') return Promise.resolve({ key: 'allowNewTeamCreation', value: true });
    if (key === 'maxTransfersPerWeek') return Promise.resolve({ key: 'maxTransfersPerWeek', value: 1 });
    if (key === 'maxPlayersPerTransfer') return Promise.resolve({ key: 'maxPlayersPerTransfer', value: 6 });
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
        toArrayHelper(makeGolferDocs([5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000]))
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

      await expect(
        savePicks(userId.toString(), golferIdStrings.slice(0, 5))
      ).rejects.toThrow('You must select exactly 6 golfers');
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
        toArrayHelper(makeGolferDocs([10_000_000, 10_000_000, 10_000_000, 10_000_000, 10_000_000, 10_000_000]))
      );

      await expect(savePicks(userId.toString(), golferIdStrings)).rejects.toThrow(
        'Budget exceeded'
      );
    });

    it('rejects when a golfer not found', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      // Return only 5 golfers when we asked for 6
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(makeGolferDocs([5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000]).slice(0, 5))
      );

      await expect(savePicks(userId.toString(), golferIdStrings)).rejects.toThrow(
        'One or more golfers not found'
      );
    });

    it('rejects when captain is not in selected golfers', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      mockGolfersCollection.find.mockReturnValue(
        toArrayHelper(makeGolferDocs([5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000]))
      );

      const invalidCaptain = new ObjectId().toString();
      await expect(
        savePicks(userId.toString(), golferIdStrings, 'Team selection', invalidCaptain)
      ).rejects.toThrow('Captain must be one of your selected golfers');
    });

    it('rejects when new team creation is disabled', async () => {
      mockPicksCollection.findOne.mockResolvedValue(null);
      mockSettingsCollection.findOne.mockImplementation(({ key }: { key: string }) => {
        if (key === 'allowNewTeamCreation') return Promise.resolve({ key: 'allowNewTeamCreation', value: false });
        return Promise.resolve(null);
      });

      await expect(savePicks(userId.toString(), golferIdStrings)).rejects.toThrow(
        'New team creation is currently disabled'
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
  });

  describe('getTransfersThisWeek', () => {
    it('returns count of transfers since week start', async () => {
      mockHistoryCollection.countDocuments.mockResolvedValue(2);

      const result = await getTransfersThisWeek(userId.toString());

      expect(result).toBe(2);
      expect(mockHistoryCollection.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: { $ne: 'Initial pick' },
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
});
