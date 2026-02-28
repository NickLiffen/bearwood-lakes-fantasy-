import { ObjectId } from 'mongodb';
import { toPick, toPickHistory, PICKS_COLLECTION, PICK_HISTORY_COLLECTION } from './Pick';
import type { PickDocument, PickHistoryDocument } from './Pick';

describe('Pick model', () => {
  const now = new Date();
  const objectId = new ObjectId();
  const userId = new ObjectId();
  const golferIds = [new ObjectId(), new ObjectId(), new ObjectId()];
  const captainId = new ObjectId();

  const fullDoc: PickDocument = {
    _id: objectId,
    userId,
    golferIds,
    captainId,
    totalSpent: 45000000,
    season: 2025,
    createdAt: now,
    updatedAt: now,
  };

  describe('toPick', () => {
    it('converts _id to string id', () => {
      expect(toPick(fullDoc).id).toBe(objectId.toString());
    });

    it('converts userId to string', () => {
      expect(toPick(fullDoc).userId).toBe(userId.toString());
    });

    it('converts golferIds to string array', () => {
      const pick = toPick(fullDoc);
      expect(pick.golferIds).toHaveLength(3);
      pick.golferIds.forEach((id, i) => {
        expect(id).toBe(golferIds[i].toString());
      });
    });

    it('converts captainId to string', () => {
      expect(toPick(fullDoc).captainId).toBe(captainId.toString());
    });

    it('returns null captainId when undefined', () => {
      const doc = { ...fullDoc, captainId: undefined };
      expect(toPick(doc).captainId).toBeNull();
    });

    it('returns null captainId when null', () => {
      const doc = { ...fullDoc, captainId: null };
      expect(toPick(doc).captainId).toBeNull();
    });

    it('maps scalar fields', () => {
      const pick = toPick(fullDoc);
      expect(pick.totalSpent).toBe(45000000);
      expect(pick.season).toBe(2025);
      expect(pick.createdAt).toBe(now);
      expect(pick.updatedAt).toBe(now);
    });
  });

  describe('toPickHistory', () => {
    const historyDoc: PickHistoryDocument = {
      _id: new ObjectId(),
      userId,
      golferIds,
      totalSpent: 40000000,
      season: 2025,
      changedAt: now,
      reason: 'Transfer',
    };

    it('converts _id to string id', () => {
      const h = toPickHistory(historyDoc);
      expect(h.id).toBe(historyDoc._id.toString());
    });

    it('converts userId and golferIds', () => {
      const h = toPickHistory(historyDoc);
      expect(h.userId).toBe(userId.toString());
      expect(h.golferIds).toHaveLength(3);
    });

    it('maps reason and changedAt', () => {
      const h = toPickHistory(historyDoc);
      expect(h.reason).toBe('Transfer');
      expect(h.changedAt).toBe(now);
    });
  });

  describe('collection constants', () => {
    it('PICKS_COLLECTION equals "picks"', () => {
      expect(PICKS_COLLECTION).toBe('picks');
    });

    it('PICK_HISTORY_COLLECTION equals "pickHistory"', () => {
      expect(PICK_HISTORY_COLLECTION).toBe('pickHistory');
    });
  });
});
