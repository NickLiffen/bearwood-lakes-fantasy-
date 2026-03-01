import { ObjectId } from 'mongodb';
import { toTournament, TOURNAMENTS_COLLECTION } from './Tournament';
import type { TournamentDocument } from './Tournament';

describe('Tournament model', () => {
  const now = new Date();
  const objectId = new ObjectId();
  const golferOids = [new ObjectId(), new ObjectId()];

  const fullDoc: TournamentDocument = {
    _id: objectId,
    name: 'The Masters',
    startDate: now,
    endDate: new Date(now.getTime() + 4 * 86400000),
    tournamentType: 'rollup_stableford',
    scoringFormat: 'stableford',
    isMultiDay: true,
    multiplier: 2,
    golferCountTier: '20+',
    season: 2025,
    status: 'completed',
    participatingGolferIds: golferOids,
    createdAt: now,
    updatedAt: now,
  };

  describe('toTournament', () => {
    it('converts _id to string id', () => {
      expect(toTournament(fullDoc).id).toBe(objectId.toString());
    });

    it('maps scalar fields', () => {
      const t = toTournament(fullDoc);
      expect(t.name).toBe('The Masters');
      expect(t.multiplier).toBe(2);
      expect(t.season).toBe(2025);
      expect(t.status).toBe('completed');
      expect(t.isMultiDay).toBe(true);
    });

    it('converts participatingGolferIds to string array', () => {
      const t = toTournament(fullDoc);
      expect(t.participatingGolferIds).toHaveLength(2);
      expect(t.participatingGolferIds[0]).toBe(golferOids[0].toString());
    });

    it('defaults tournamentType to rollup_stableford when falsy', () => {
      const doc = { ...fullDoc, tournamentType: undefined } as unknown as TournamentDocument;
      expect(toTournament(doc).tournamentType).toBe('rollup_stableford');
    });

    it('defaults scoringFormat to stableford when falsy', () => {
      const doc = { ...fullDoc, scoringFormat: undefined } as unknown as TournamentDocument;
      expect(toTournament(doc).scoringFormat).toBe('stableford');
    });

    it('defaults isMultiDay to false when undefined', () => {
      const doc = { ...fullDoc, isMultiDay: undefined } as unknown as TournamentDocument;
      expect(toTournament(doc).isMultiDay).toBe(false);
    });

    it('defaults golferCountTier to 20+ when falsy', () => {
      const doc = { ...fullDoc, golferCountTier: undefined } as unknown as TournamentDocument;
      expect(toTournament(doc).golferCountTier).toBe('20+');
    });

    it('defaults participatingGolferIds to empty array when falsy', () => {
      const doc = {
        ...fullDoc,
        participatingGolferIds: undefined,
      } as unknown as TournamentDocument;
      expect(toTournament(doc).participatingGolferIds).toEqual([]);
    });
  });

  describe('TOURNAMENTS_COLLECTION', () => {
    it('equals "tournaments"', () => {
      expect(TOURNAMENTS_COLLECTION).toBe('tournaments');
    });
  });
});
