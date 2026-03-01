import { ObjectId } from 'mongodb';
import {
  toGolfer,
  defaultStats2024,
  defaultStats2025,
  defaultStats2026,
  GOLFERS_COLLECTION,
} from './Golfer';
import type { GolferDocument } from './Golfer';

describe('Golfer model', () => {
  const now = new Date();
  const objectId = new ObjectId();

  const stats = {
    timesScored36Plus: 2,
    timesScored32Plus: 5,
    timesFinished1st: 1,
    timesFinished2nd: 0,
    timesFinished3rd: 3,
    timesPlayed: 10,
  };

  const fullDoc: GolferDocument = {
    _id: objectId,
    firstName: 'Tiger',
    lastName: 'Woods',
    picture: 'https://example.com/tiger.jpg',
    price: 12000000,
    isActive: true,
    stats2024: { ...stats },
    stats2025: { ...stats, timesPlayed: 5 },
    stats2026: { ...stats, timesPlayed: 0 },
    createdAt: now,
    updatedAt: now,
  };

  describe('toGolfer', () => {
    it('converts _id to string id', () => {
      expect(toGolfer(fullDoc).id).toBe(objectId.toString());
    });

    it('maps all scalar fields', () => {
      const golfer = toGolfer(fullDoc);
      expect(golfer.firstName).toBe('Tiger');
      expect(golfer.lastName).toBe('Woods');
      expect(golfer.picture).toBe('https://example.com/tiger.jpg');
      expect(golfer.price).toBe(12000000);
      expect(golfer.isActive).toBe(true);
    });

    it('maps stats objects', () => {
      const golfer = toGolfer(fullDoc);
      expect(golfer.stats2024.timesPlayed).toBe(10);
      expect(golfer.stats2025.timesPlayed).toBe(5);
      expect(golfer.stats2026.timesPlayed).toBe(0);
    });

    it('defaults stats2024 when falsy', () => {
      const doc = { ...fullDoc, stats2024: undefined } as unknown as GolferDocument;
      expect(toGolfer(doc).stats2024).toEqual(defaultStats2024);
    });

    it('defaults stats2025 when falsy', () => {
      const doc = { ...fullDoc, stats2025: undefined } as unknown as GolferDocument;
      expect(toGolfer(doc).stats2025).toEqual(defaultStats2025);
    });

    it('defaults stats2026 when falsy', () => {
      const doc = { ...fullDoc, stats2026: undefined } as unknown as GolferDocument;
      expect(toGolfer(doc).stats2026).toEqual(defaultStats2026);
    });
  });

  describe('default stats', () => {
    it('all have zero values', () => {
      for (const stats of [defaultStats2024, defaultStats2025, defaultStats2026]) {
        expect(stats.timesScored36Plus).toBe(0);
        expect(stats.timesScored32Plus).toBe(0);
        expect(stats.timesFinished1st).toBe(0);
        expect(stats.timesFinished2nd).toBe(0);
        expect(stats.timesFinished3rd).toBe(0);
        expect(stats.timesPlayed).toBe(0);
      }
    });
  });

  describe('GOLFERS_COLLECTION', () => {
    it('equals "golfers"', () => {
      expect(GOLFERS_COLLECTION).toBe('golfers');
    });
  });
});
