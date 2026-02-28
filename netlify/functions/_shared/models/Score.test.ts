import { ObjectId } from 'mongodb';
import { toScore, SCORES_COLLECTION } from './Score';
import type { ScoreDocument } from './Score';

describe('Score model', () => {
  const now = new Date();
  const objectId = new ObjectId();
  const tournamentId = new ObjectId();
  const golferId = new ObjectId();

  const fullDoc: ScoreDocument = {
    _id: objectId,
    tournamentId,
    golferId,
    participated: true,
    position: 1,
    rawScore: 72,
    basePoints: 36,
    bonusPoints: 5,
    multipliedPoints: 41,
    createdAt: now,
    updatedAt: now,
  };

  describe('toScore', () => {
    it('converts _id to string id', () => {
      expect(toScore(fullDoc).id).toBe(objectId.toString());
    });

    it('converts tournamentId to string', () => {
      expect(toScore(fullDoc).tournamentId).toBe(tournamentId.toString());
    });

    it('converts golferId to string', () => {
      expect(toScore(fullDoc).golferId).toBe(golferId.toString());
    });

    it('maps numeric fields', () => {
      const score = toScore(fullDoc);
      expect(score.position).toBe(1);
      expect(score.rawScore).toBe(72);
      expect(score.basePoints).toBe(36);
      expect(score.bonusPoints).toBe(5);
      expect(score.multipliedPoints).toBe(41);
    });

    it('maps participated field', () => {
      expect(toScore(fullDoc).participated).toBe(true);
    });

    it('defaults participated to true when undefined', () => {
      const doc = { ...fullDoc, participated: undefined } as unknown as ScoreDocument;
      expect(toScore(doc).participated).toBe(true);
    });

    it('defaults rawScore to null when undefined', () => {
      const doc = { ...fullDoc, rawScore: undefined } as unknown as ScoreDocument;
      expect(toScore(doc).rawScore).toBeNull();
    });

    it('defaults basePoints to 0 when undefined', () => {
      const doc = { ...fullDoc, basePoints: undefined } as unknown as ScoreDocument;
      expect(toScore(doc).basePoints).toBe(0);
    });

    it('defaults bonusPoints to 0 when undefined', () => {
      const doc = { ...fullDoc, bonusPoints: undefined } as unknown as ScoreDocument;
      expect(toScore(doc).bonusPoints).toBe(0);
    });

    it('defaults multipliedPoints to 0 when undefined', () => {
      const doc = { ...fullDoc, multipliedPoints: undefined } as unknown as ScoreDocument;
      expect(toScore(doc).multipliedPoints).toBe(0);
    });

    it('defaults tournamentId to empty string when undefined', () => {
      const doc = { ...fullDoc, tournamentId: undefined } as unknown as ScoreDocument;
      expect(toScore(doc).tournamentId).toBe('');
    });

    it('defaults golferId to empty string when undefined', () => {
      const doc = { ...fullDoc, golferId: undefined } as unknown as ScoreDocument;
      expect(toScore(doc).golferId).toBe('');
    });
  });

  describe('SCORES_COLLECTION', () => {
    it('equals "scores"', () => {
      expect(SCORES_COLLECTION).toBe('scores');
    });
  });
});
