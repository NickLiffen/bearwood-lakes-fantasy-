import type { Db, MongoClient } from 'mongodb';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  getAllSeasons,
  getActiveSeason,
  getSeasonById,
  getSeasonByName,
  createSeason,
  updateSeason,
  setActiveSeason,
  deleteSeason,
} from './seasons.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('../rateLimit', () => ({
  getRedisClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  }),
  getRedisKeyPrefix: vi.fn().mockReturnValue('test:'),
}));

const mockSeasonsCollection = {
  find: vi.fn(),
  findOne: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateMany: vi.fn(),
  deleteOne: vi.fn(),
};

const toArraySorted = <T>(items: T[]) => ({
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
  toArray: vi.fn().mockResolvedValue(items),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockReturnValue(mockSeasonsCollection),
    } as unknown as Db,
    client: {} as unknown as MongoClient,
  });
});

describe('seasons.service', () => {
  const seasonId = new ObjectId();
  const seasonDoc = {
    _id: seasonId,
    name: '2025',
    startDate: new Date('2025-04-01'),
    endDate: new Date('2025-10-31'),
    isActive: true,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('getAllSeasons', () => {
    it('returns all seasons sorted by start date', async () => {
      mockSeasonsCollection.find.mockReturnValue(toArraySorted([seasonDoc]));

      const result = await getAllSeasons();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('2025');
    });
  });

  describe('getActiveSeason', () => {
    it('returns the active season', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(seasonDoc);

      const result = await getActiveSeason();

      expect(result).toBeDefined();
      expect(result!.isActive).toBe(true);
    });

    it('returns null when no active season', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(null);

      const result = await getActiveSeason();

      expect(result).toBeNull();
    });
  });

  describe('getSeasonById', () => {
    it('returns season by id', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(seasonDoc);

      const result = await getSeasonById(seasonId.toString());

      expect(result!.id).toBe(seasonId.toString());
    });

    it('returns null when not found', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(null);

      const result = await getSeasonById(new ObjectId().toString());

      expect(result).toBeNull();
    });
  });

  describe('getSeasonByName', () => {
    it('returns season by name (case insensitive)', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(seasonDoc);

      const result = await getSeasonByName('2025');

      expect(result!.name).toBe('2025');
    });
  });

  describe('createSeason', () => {
    it('creates a new season', async () => {
      const insertedId = new ObjectId();
      mockSeasonsCollection.insertOne.mockResolvedValue({ insertedId });

      const result = await createSeason({
        name: '2026',
        startDate: '2026-04-01',
        endDate: '2026-10-31',
      });

      expect(result.name).toBe('2026');
      expect(result.id).toBe(insertedId.toString());
    });

    it('deactivates all seasons when creating an active season', async () => {
      const insertedId = new ObjectId();
      mockSeasonsCollection.insertOne.mockResolvedValue({ insertedId });
      mockSeasonsCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });

      await createSeason({
        name: '2026',
        startDate: '2026-04-01',
        endDate: '2026-10-31',
        isActive: true,
      });

      expect(mockSeasonsCollection.updateMany).toHaveBeenCalledWith(
        {},
        { $set: { isActive: false } }
      );
    });
  });

  describe('updateSeason', () => {
    it('updates season fields', async () => {
      mockSeasonsCollection.findOneAndUpdate.mockResolvedValue({
        ...seasonDoc,
        name: 'Updated 2025',
      });

      const result = await updateSeason(seasonId.toString(), { name: 'Updated 2025' });

      expect(result!.name).toBe('Updated 2025');
    });

    it('deactivates other seasons when setting active', async () => {
      mockSeasonsCollection.findOneAndUpdate.mockResolvedValue(seasonDoc);
      mockSeasonsCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });

      await updateSeason(seasonId.toString(), { isActive: true });

      expect(mockSeasonsCollection.updateMany).toHaveBeenCalledWith(
        {},
        { $set: { isActive: false } }
      );
    });

    it('returns null when season not found', async () => {
      mockSeasonsCollection.findOneAndUpdate.mockResolvedValue(null);

      const result = await updateSeason(new ObjectId().toString(), { name: 'X' });

      expect(result).toBeNull();
    });
  });

  describe('setActiveSeason', () => {
    it('sets a season as active and deactivates others', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(seasonDoc);
      mockSeasonsCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });
      mockSeasonsCollection.findOneAndUpdate.mockResolvedValue({ ...seasonDoc, isActive: true });

      const result = await setActiveSeason(seasonId.toString());

      expect(result!.isActive).toBe(true);
      expect(mockSeasonsCollection.updateMany).toHaveBeenCalled();
    });

    it('returns null when target season does not exist', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(null);

      const result = await setActiveSeason(new ObjectId().toString());

      expect(result).toBeNull();
    });
  });

  describe('deleteSeason', () => {
    it('deletes non-active season', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue({ ...seasonDoc, isActive: false });
      mockSeasonsCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await deleteSeason(seasonId.toString());

      expect(result).toBe(true);
    });

    it('throws when trying to delete active season', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(seasonDoc);

      await expect(deleteSeason(seasonId.toString())).rejects.toThrow(
        'Cannot delete the active season'
      );
    });

    it('returns false when season not found', async () => {
      mockSeasonsCollection.findOne.mockResolvedValue(null);
      mockSeasonsCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await deleteSeason(new ObjectId().toString());

      expect(result).toBe(false);
    });
  });
});
