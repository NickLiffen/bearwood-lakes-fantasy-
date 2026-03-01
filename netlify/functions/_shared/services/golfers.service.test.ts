import { ObjectId } from 'mongodb';
import type { Db, MongoClient } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  getAllGolfers,
  getActiveGolfers,
  getGolferById,
  createGolfer,
  updateGolfer,
  deleteGolfer,
} from './golfers.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

const mockGolfersCollection = {
  find: vi.fn(),
  findOne: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
};

const toArrayHelper = <T>(items: T[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockReturnValue(mockGolfersCollection),
    } as unknown as Db,
    client: {} as unknown as MongoClient,
  });
});

describe('golfers.service', () => {
  const golferId = new ObjectId();
  const defaultStats = {
    timesScored36Plus: 0,
    timesScored32Plus: 0,
    timesFinished1st: 0,
    timesFinished2nd: 0,
    timesFinished3rd: 0,
    timesPlayed: 0,
  };
  const golferDoc = {
    _id: golferId,
    firstName: 'Tiger',
    lastName: 'Woods',
    picture: 'tiger.jpg',
    price: 15_000_000,
    isActive: true,
    stats2024: defaultStats,
    stats2025: defaultStats,
    stats2026: defaultStats,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('getAllGolfers', () => {
    it('returns all golfers', async () => {
      mockGolfersCollection.find.mockReturnValue(toArrayHelper([golferDoc]));

      const result = await getAllGolfers();

      expect(result).toHaveLength(1);
      expect(result[0].firstName).toBe('Tiger');
    });

    it('applies skip and limit when provided', async () => {
      const cursor = {
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([golferDoc]),
      };
      mockGolfersCollection.find.mockReturnValue(cursor);

      const result = await getAllGolfers({ skip: 10, limit: 5 });

      expect(cursor.skip).toHaveBeenCalledWith(10);
      expect(cursor.limit).toHaveBeenCalledWith(5);
      expect(result).toHaveLength(1);
    });
  });

  describe('getActiveGolfers', () => {
    it('returns only active golfers', async () => {
      mockGolfersCollection.find.mockReturnValue(toArrayHelper([golferDoc]));

      const result = await getActiveGolfers();

      expect(result).toHaveLength(1);
      expect(mockGolfersCollection.find).toHaveBeenCalledWith({ isActive: true });
    });
  });

  describe('getGolferById', () => {
    it('returns golfer when found', async () => {
      mockGolfersCollection.findOne.mockResolvedValue(golferDoc);

      const result = await getGolferById(golferId.toString());

      expect(result!.id).toBe(golferId.toString());
      expect(result!.lastName).toBe('Woods');
    });

    it('returns null when not found', async () => {
      mockGolfersCollection.findOne.mockResolvedValue(null);

      const result = await getGolferById(new ObjectId().toString());

      expect(result).toBeNull();
    });
  });

  describe('createGolfer', () => {
    it('creates a golfer with defaults', async () => {
      const insertedId = new ObjectId();
      mockGolfersCollection.insertOne.mockResolvedValue({ insertedId });

      const result = await createGolfer({
        firstName: 'Rory',
        lastName: 'McIlroy',
        picture: 'rory.jpg',
        price: 12_000_000,
      });

      expect(result.firstName).toBe('Rory');
      expect(result.isActive).toBe(true);
      expect(result.id).toBe(insertedId.toString());
    });

    it('creates an inactive golfer when specified', async () => {
      const insertedId = new ObjectId();
      mockGolfersCollection.insertOne.mockResolvedValue({ insertedId });

      const result = await createGolfer({
        firstName: 'Phil',
        lastName: 'Mickelson',
        picture: '',
        price: 3_000_000,
        isActive: false,
      });

      expect(result.isActive).toBe(false);
    });
  });

  describe('updateGolfer', () => {
    it('updates and returns the golfer', async () => {
      mockGolfersCollection.findOneAndUpdate.mockResolvedValue({
        ...golferDoc,
        price: 20_000_000,
      });

      const result = await updateGolfer(golferId.toString(), { price: 20_000_000 });

      expect(result!.price).toBe(20_000_000);
    });

    it('returns null when golfer not found', async () => {
      mockGolfersCollection.findOneAndUpdate.mockResolvedValue(null);

      const result = await updateGolfer(new ObjectId().toString(), { price: 5_000_000 });

      expect(result).toBeNull();
    });
  });

  describe('deleteGolfer', () => {
    it('returns true on successful deletion', async () => {
      mockGolfersCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await deleteGolfer(golferId.toString());

      expect(result).toBe(true);
    });

    it('returns false when golfer not found', async () => {
      mockGolfersCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await deleteGolfer(new ObjectId().toString());

      expect(result).toBe(false);
    });
  });
});
