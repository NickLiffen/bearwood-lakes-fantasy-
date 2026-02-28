import { connectToDatabase } from '../db';
import { getRedisClient, getRedisKeyPrefix } from '../rateLimit';
import { getSetting, setSetting, getAppSettings } from './settings.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('../rateLimit', () => ({
  getRedisClient: vi.fn(),
  getRedisKeyPrefix: vi.fn().mockReturnValue('test:'),
}));

const mockSettingsCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
};

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockReturnValue(mockSettingsCollection),
    } as any,
    client: {} as any,
  });
  vi.mocked(getRedisClient).mockReturnValue(mockRedis as any);
});

describe('settings.service', () => {
  describe('getSetting', () => {
    it('returns cached value from Redis when available', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(true));

      const result = await getSetting<boolean>('transfersOpen');

      expect(result).toBe(true);
      expect(mockSettingsCollection.findOne).not.toHaveBeenCalled();
    });

    it('falls back to MongoDB on Redis miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSettingsCollection.findOne.mockResolvedValue({ key: 'transfersOpen', value: true });

      const result = await getSetting<boolean>('transfersOpen');

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('returns null when setting not in Redis or MongoDB', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSettingsCollection.findOne.mockResolvedValue(null);

      const result = await getSetting<boolean>('nonExistent');

      expect(result).toBeNull();
    });

    it('falls back to MongoDB when Redis throws', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      mockSettingsCollection.findOne.mockResolvedValue({ key: 'transfersOpen', value: false });

      const result = await getSetting<boolean>('transfersOpen');

      expect(result).toBe(false);
    });
  });

  describe('setSetting', () => {
    it('upserts setting in MongoDB and invalidates cache', async () => {
      mockSettingsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockRedis.del.mockResolvedValue(1);

      await setSetting('transfersOpen', true);

      expect(mockSettingsCollection.updateOne).toHaveBeenCalledWith(
        { key: 'transfersOpen' },
        expect.objectContaining({
          $set: expect.objectContaining({ value: true }),
        }),
        { upsert: true }
      );
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('continues when Redis cache invalidation fails', async () => {
      mockSettingsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockRedis.del.mockRejectedValue(new Error('Redis down'));

      await expect(setSetting('transfersOpen', false)).resolves.toBeUndefined();
    });
  });

  describe('getAppSettings', () => {
    it('returns defaults when no settings configured', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSettingsCollection.findOne.mockResolvedValue(null);

      const result = await getAppSettings();

      expect(result).toEqual({
        transfersOpen: false,
        registrationOpen: true,
        allowNewTeamCreation: true,
        maxTransfersPerWeek: 1,
        maxPlayersPerTransfer: 6,
      });
    });

    it('returns stored settings when they exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSettingsCollection.findOne.mockImplementation(({ key }: { key: string }) => {
        const map: Record<string, any> = {
          transfersOpen: { key: 'transfersOpen', value: true },
          registrationOpen: { key: 'registrationOpen', value: false },
          allowNewTeamCreation: { key: 'allowNewTeamCreation', value: false },
          maxTransfersPerWeek: { key: 'maxTransfersPerWeek', value: 3 },
          maxPlayersPerTransfer: { key: 'maxPlayersPerTransfer', value: 2 },
        };
        return Promise.resolve(map[key] ?? null);
      });

      const result = await getAppSettings();

      expect(result.transfersOpen).toBe(true);
      expect(result.registrationOpen).toBe(false);
      expect(result.maxTransfersPerWeek).toBe(3);
    });
  });
});
