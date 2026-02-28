import { ObjectId } from 'mongodb';
import { toSeason, SEASONS_COLLECTION } from './Season';
import type { SeasonDocument } from './Season';

describe('Season model', () => {
  const now = new Date();
  const objectId = new ObjectId();

  const fullDoc: SeasonDocument = {
    _id: objectId,
    name: '2025 Season',
    startDate: new Date(2025, 0, 1),
    endDate: new Date(2025, 11, 31),
    isActive: true,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  describe('toSeason', () => {
    it('converts _id to string id', () => {
      expect(toSeason(fullDoc).id).toBe(objectId.toString());
    });

    it('maps all fields correctly', () => {
      const s = toSeason(fullDoc);
      expect(s.name).toBe('2025 Season');
      expect(s.startDate).toEqual(new Date(2025, 0, 1));
      expect(s.endDate).toEqual(new Date(2025, 11, 31));
      expect(s.isActive).toBe(true);
      expect(s.status).toBe('active');
      expect(s.createdAt).toBe(now);
      expect(s.updatedAt).toBe(now);
    });

    it('defaults isActive to false when undefined', () => {
      const doc = { ...fullDoc, isActive: undefined } as unknown as SeasonDocument;
      expect(toSeason(doc).isActive).toBe(false);
    });

    it('defaults status to setup when falsy', () => {
      const doc = { ...fullDoc, status: undefined } as unknown as SeasonDocument;
      expect(toSeason(doc).status).toBe('setup');
    });
  });

  describe('SEASONS_COLLECTION', () => {
    it('equals "seasons"', () => {
      expect(SEASONS_COLLECTION).toBe('seasons');
    });
  });
});
