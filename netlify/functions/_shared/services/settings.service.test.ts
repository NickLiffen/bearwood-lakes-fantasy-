import type { Db, MongoClient } from 'mongodb';
import type { Redis } from 'ioredis';
import { connectToDatabase } from '../db';
import { getRedisClient } from '../rateLimit';
import {
  getSetting,
  getSettings,
  setSetting,
  getAppSettings,
  getAppSettingsDoc,
  setAppSettingsDoc,
} from './settings.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('../rateLimit', () => ({
  getRedisClient: vi.fn(),
  getRedisKeyPrefix: vi.fn().mockReturnValue('test:'),
}));

const mockSettingsCollection = {
  findOne: vi.fn(),
  find: vi.fn(),
  updateOne: vi.fn(),
};

const mockRedis = {
  get: vi.fn(),
  mget: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockReturnValue(mockSettingsCollection),
    } as unknown as Db,
    client: {} as unknown as MongoClient,
  });
  vi.mocked(getRedisClient).mockReturnValue(mockRedis as unknown as Redis);
  mockSettingsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
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
      mockRedis.mget.mockResolvedValue([null, null, null, null, null]);

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
      mockRedis.mget.mockResolvedValue([null, null, null, null, null]);
      mockSettingsCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { key: 'transfersOpen', value: true },
          { key: 'registrationOpen', value: false },
          { key: 'allowNewTeamCreation', value: false },
          { key: 'maxTransfersPerWeek', value: 3 },
          { key: 'maxPlayersPerTransfer', value: 2 },
        ]),
      });

      const result = await getAppSettings();

      expect(result.transfersOpen).toBe(true);
      expect(result.registrationOpen).toBe(false);
      expect(result.maxTransfersPerWeek).toBe(3);
    });
  });

  describe('getSettings', () => {
    it('returns all values from Redis cache when all hit', async () => {
      mockRedis.mget.mockResolvedValue([
        JSON.stringify(true),
        JSON.stringify(42),
      ]);

      const result = await getSettings(['flagA', 'numB']);

      expect(result.get('flagA')).toBe(true);
      expect(result.get('numB')).toBe(42);
      expect(mockSettingsCollection.find).not.toHaveBeenCalled();
    });

    it('falls through to MongoDB when all cache miss', async () => {
      mockRedis.mget.mockResolvedValue([null, null]);
      mockSettingsCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { key: 'flagA', value: true },
          { key: 'numB', value: 7 },
        ]),
      });

      const result = await getSettings(['flagA', 'numB']);

      expect(result.get('flagA')).toBe(true);
      expect(result.get('numB')).toBe(7);
      expect(mockSettingsCollection.find).toHaveBeenCalledWith({
        key: { $in: ['flagA', 'numB'] },
      });
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });

    it('handles partial cache hits', async () => {
      mockRedis.mget.mockResolvedValue([JSON.stringify('cached'), null]);
      mockSettingsCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ key: 'keyB', value: 'fromDb' }]),
      });

      const result = await getSettings(['keyA', 'keyB']);

      expect(result.get('keyA')).toBe('cached');
      expect(result.get('keyB')).toBe('fromDb');
      expect(mockSettingsCollection.find).toHaveBeenCalledWith({
        key: { $in: ['keyB'] },
      });
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('falls through to MongoDB when Redis is unavailable', async () => {
      mockRedis.mget.mockRejectedValue(new Error('Redis down'));
      mockSettingsCollection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ key: 'flagA', value: false }]),
      });

      const result = await getSettings(['flagA', 'flagB']);

      expect(result.get('flagA')).toBe(false);
      expect(result.get('flagB')).toBeNull();
    });

    it('returns empty map for empty keys array', async () => {
      const result = await getSettings([]);

      expect(result.size).toBe(0);
      expect(mockRedis.mget).not.toHaveBeenCalled();
    });
  });

  describe('getAppSettingsDoc', () => {
    const fullSettings = {
      transfersOpen: true,
      registrationOpen: false,
      allowNewTeamCreation: false,
      maxTransfersPerWeek: 3,
      maxPlayersPerTransfer: 2,
    };

    it('returns cached value from Redis when available', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(fullSettings));

      const result = await getAppSettingsDoc();

      expect(result).toEqual(fullSettings);
      expect(mockSettingsCollection.findOne).not.toHaveBeenCalled();
    });

    it('returns consolidated doc from MongoDB on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSettingsCollection.findOne.mockResolvedValue({
        key: 'appSettings',
        value: fullSettings,
      });

      const result = await getAppSettingsDoc();

      expect(result).toEqual(fullSettings);
      expect(mockSettingsCollection.findOne).toHaveBeenCalledWith({ key: 'appSettings' });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:v1:cache:settings:appSettings',
        JSON.stringify(fullSettings),
        'EX',
        300
      );
    });

    it('falls back to individual keys when no consolidated doc exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockSettingsCollection.findOne.mockResolvedValue(null);
      // getAppSettings will call getSettings which uses mget
      mockRedis.mget.mockResolvedValue([null, null, null, null, null]);

      const result = await getAppSettingsDoc();

      expect(result).toEqual({
        transfersOpen: false,
        registrationOpen: true,
        allowNewTeamCreation: true,
        maxTransfersPerWeek: 1,
        maxPlayersPerTransfer: 6,
      });
    });
  });

  describe('setAppSettingsDoc', () => {
    const fullSettings = {
      transfersOpen: true,
      registrationOpen: false,
      allowNewTeamCreation: true,
      maxTransfersPerWeek: 2,
      maxPlayersPerTransfer: 4,
    };

    it('upserts consolidated doc and invalidates cache', async () => {
      mockSettingsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockRedis.del.mockResolvedValue(1);

      await setAppSettingsDoc(fullSettings);

      expect(mockSettingsCollection.updateOne).toHaveBeenCalledWith(
        { key: 'appSettings' },
        expect.objectContaining({
          $set: expect.objectContaining({ value: fullSettings }),
          $setOnInsert: { key: 'appSettings' },
        }),
        { upsert: true }
      );
      expect(mockRedis.del).toHaveBeenCalledWith('test:v1:cache:settings:appSettings');
    });

    it('continues when Redis cache invalidation fails', async () => {
      mockSettingsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockRedis.del.mockRejectedValue(new Error('Redis down'));

      await expect(setAppSettingsDoc(fullSettings)).resolves.toBeUndefined();
    });
  });
});
