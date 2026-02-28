import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  enterScore,
  bulkEnterScores,
  deleteScore,
  deleteScoresForTournament,
  deleteScoresForGolfer,
  getScoresForTournament,
  getAllScores,
  recalculateScoresForTournament,
} from './scores.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

const mockScoresCollection = {
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn(),
  bulkWrite: vi.fn(),
  updateOne: vi.fn(),
};

const mockTournamentsCollection = {
  findOne: vi.fn(),
  find: vi.fn(),
};

const toArrayHelper = (items: any[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'scores') return mockScoresCollection;
        if (name === 'tournaments') return mockTournamentsCollection;
        return {};
      }),
    } as any,
    client: {} as any,
  });
});

describe('scores.service', () => {
  const tournamentId = new ObjectId();
  const golferId = new ObjectId();
  const scoreId = new ObjectId();

  const makeTournament = (overrides = {}) => ({
    _id: tournamentId,
    name: 'Test Tournament',
    scoringFormat: 'stableford',
    isMultiDay: false,
    multiplier: 1,
    ...overrides,
  });

  describe('enterScore', () => {
    it('calculates points for 1st place stableford 1x with score 38', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(makeTournament());
      const resultDoc = {
        _id: scoreId,
        tournamentId,
        golferId,
        participated: true,
        position: 1,
        rawScore: 38,
        basePoints: 10,
        bonusPoints: 3,
        multipliedPoints: 13,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockScoresCollection.findOneAndUpdate.mockResolvedValue(resultDoc);

      const result = await enterScore({
        tournamentId: tournamentId.toString(),
        golferId: golferId.toString(),
        participated: true,
        position: 1,
        rawScore: 38,
      });

      // 1st = 10 base, 38 stableford = 3 bonus, (10+3)*1 = 13
      expect(mockScoresCollection.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            basePoints: 10,
            bonusPoints: 3,
            multipliedPoints: 13,
          }),
        }),
        { upsert: true, returnDocument: 'after' }
      );
      expect(result.multipliedPoints).toBe(13);
    });

    it('calculates points for 2nd place weekend medal 2x with raw score 2 (over par)', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(
        makeTournament({ scoringFormat: 'medal', multiplier: 2 })
      );
      const resultDoc = {
        _id: scoreId,
        tournamentId,
        golferId,
        participated: true,
        position: 2,
        rawScore: 2,
        basePoints: 7,
        bonusPoints: 1,
        multipliedPoints: 16,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockScoresCollection.findOneAndUpdate.mockResolvedValue(resultDoc);

      await enterScore({
        tournamentId: tournamentId.toString(),
        golferId: golferId.toString(),
        participated: true,
        position: 2,
        rawScore: 2,
      });

      // 2nd = 7 base, medal rawScore=2 (<=4) = 1 bonus, (7+1)*2 = 16
      expect(mockScoresCollection.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            basePoints: 7,
            bonusPoints: 1,
            multipliedPoints: 16,
          }),
        }),
        expect.any(Object)
      );
    });

    it('calculates points for 3rd place founders 4x with stableford 40 (multi-day)', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(
        makeTournament({ scoringFormat: 'stableford', isMultiDay: true, multiplier: 4 })
      );
      const resultDoc = {
        _id: scoreId,
        tournamentId,
        golferId,
        participated: true,
        position: 3,
        rawScore: 40,
        basePoints: 5,
        bonusPoints: 0,
        multipliedPoints: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockScoresCollection.findOneAndUpdate.mockResolvedValue(resultDoc);

      await enterScore({
        tournamentId: tournamentId.toString(),
        golferId: golferId.toString(),
        participated: true,
        position: 3,
        rawScore: 40,
      });

      // 3rd = 5 base, multi-day stableford 40 < 64 but >= nothing: 0 bonus
      // Actually 40 < 64 so 0 bonus. (5+0)*4 = 20
      expect(mockScoresCollection.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            basePoints: 5,
            bonusPoints: 0,
            multipliedPoints: 20,
          }),
        }),
        expect.any(Object)
      );
    });

    it('gives zero points when participated is false', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(makeTournament());
      const resultDoc = {
        _id: scoreId,
        tournamentId,
        golferId,
        participated: false,
        position: null,
        rawScore: null,
        basePoints: 0,
        bonusPoints: 0,
        multipliedPoints: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockScoresCollection.findOneAndUpdate.mockResolvedValue(resultDoc);

      await enterScore({
        tournamentId: tournamentId.toString(),
        golferId: golferId.toString(),
        participated: false,
        position: null as any,
        rawScore: null as any,
      });

      expect(mockScoresCollection.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            basePoints: 0,
            bonusPoints: 0,
            multipliedPoints: 0,
          }),
        }),
        expect.any(Object)
      );
    });

    it('throws when tournament not found', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(null);

      await expect(
        enterScore({
          tournamentId: tournamentId.toString(),
          golferId: golferId.toString(),
          participated: true,
          position: 1,
          rawScore: 36,
        })
      ).rejects.toThrow('Tournament not found');
    });

    it('gives bonus 1 for stableford score of 32', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(makeTournament());
      mockScoresCollection.findOneAndUpdate.mockResolvedValue({
        _id: scoreId, tournamentId, golferId,
        participated: true, position: 5, rawScore: 32,
        basePoints: 0, bonusPoints: 1, multipliedPoints: 1,
        createdAt: new Date(), updatedAt: new Date(),
      });

      await enterScore({
        tournamentId: tournamentId.toString(),
        golferId: golferId.toString(),
        participated: true,
        position: 5,
        rawScore: 32,
      });

      // 5th = 0 base, 32 stableford >= 32 = 1 bonus, (0+1)*1 = 1
      expect(mockScoresCollection.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            basePoints: 0,
            bonusPoints: 1,
            multipliedPoints: 1,
          }),
        }),
        expect.any(Object)
      );
    });

    it('gives bonus 3 for medal score at par (0) single-day', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(
        makeTournament({ scoringFormat: 'medal', multiplier: 1 })
      );
      mockScoresCollection.findOneAndUpdate.mockResolvedValue({
        _id: scoreId, tournamentId, golferId,
        participated: true, position: 1, rawScore: 0,
        basePoints: 10, bonusPoints: 3, multipliedPoints: 13,
        createdAt: new Date(), updatedAt: new Date(),
      });

      await enterScore({
        tournamentId: tournamentId.toString(),
        golferId: golferId.toString(),
        participated: true,
        position: 1,
        rawScore: 0,
      });

      // medal rawScore=0 (<=0) = 3 bonus
      expect(mockScoresCollection.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            bonusPoints: 3,
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('bulkEnterScores', () => {
    it('processes multiple scores in a single bulkWrite', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(makeTournament({ multiplier: 2 }));
      mockScoresCollection.bulkWrite.mockResolvedValue({ modifiedCount: 2 });
      const g1 = new ObjectId();
      const g2 = new ObjectId();
      mockScoresCollection.find.mockReturnValue(
        toArrayHelper([
          { _id: new ObjectId(), tournamentId, golferId: g1, participated: true, position: 1, rawScore: 36, basePoints: 10, bonusPoints: 3, multipliedPoints: 26, createdAt: new Date(), updatedAt: new Date() },
          { _id: new ObjectId(), tournamentId, golferId: g2, participated: true, position: 2, rawScore: 30, basePoints: 7, bonusPoints: 0, multipliedPoints: 14, createdAt: new Date(), updatedAt: new Date() },
        ])
      );

      const result = await bulkEnterScores({
        tournamentId: tournamentId.toString(),
        scores: [
          { golferId: g1.toString(), participated: true, position: 1, rawScore: 36 },
          { golferId: g2.toString(), participated: true, position: 2, rawScore: 30 },
        ],
      });

      expect(mockScoresCollection.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              update: expect.objectContaining({
                $set: expect.objectContaining({ multipliedPoints: 26 }),
              }),
            }),
          }),
        ])
      );
      expect(result).toHaveLength(2);
    });

    it('throws when tournament not found', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(null);

      await expect(
        bulkEnterScores({
          tournamentId: tournamentId.toString(),
          scores: [{ golferId: golferId.toString(), participated: true, position: 1, rawScore: 36 }],
        })
      ).rejects.toThrow('Tournament not found');
    });
  });

  describe('deleteScore', () => {
    it('returns true when score is deleted', async () => {
      mockScoresCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });
      const result = await deleteScore(scoreId.toString());
      expect(result).toBe(true);
    });

    it('returns false when score not found', async () => {
      mockScoresCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });
      const result = await deleteScore(scoreId.toString());
      expect(result).toBe(false);
    });
  });

  describe('deleteScoresForTournament', () => {
    it('returns count of deleted scores', async () => {
      mockScoresCollection.deleteMany.mockResolvedValue({ deletedCount: 5 });
      const result = await deleteScoresForTournament(tournamentId.toString());
      expect(result).toBe(5);
    });
  });

  describe('deleteScoresForGolfer', () => {
    it('returns count of deleted scores', async () => {
      mockScoresCollection.deleteMany.mockResolvedValue({ deletedCount: 3 });
      const result = await deleteScoresForGolfer(golferId.toString());
      expect(result).toBe(3);
    });
  });

  describe('getScoresForTournament', () => {
    it('returns mapped scores', async () => {
      mockScoresCollection.find.mockReturnValue(
        toArrayHelper([
          {
            _id: scoreId,
            tournamentId,
            golferId,
            participated: true,
            position: 1,
            rawScore: 38,
            basePoints: 10,
            bonusPoints: 3,
            multipliedPoints: 13,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ])
      );

      const result = await getScoresForTournament(tournamentId.toString());

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(scoreId.toString());
    });
  });

  describe('recalculateScoresForTournament', () => {
    it('recalculates all scores for a tournament', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(makeTournament({ multiplier: 3 }));
      mockScoresCollection.find.mockReturnValue(
        toArrayHelper([
          {
            _id: scoreId,
            tournamentId,
            golferId,
            participated: true,
            position: 1,
            rawScore: 36,
            basePoints: 10,
            bonusPoints: 3,
            multipliedPoints: 13,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ])
      );
      mockScoresCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const count = await recalculateScoresForTournament(tournamentId.toString());

      expect(count).toBe(1);
      // With multiplier 3: (10+3)*3 = 39
      expect(mockScoresCollection.updateOne).toHaveBeenCalledWith(
        { _id: scoreId },
        {
          $set: expect.objectContaining({
            basePoints: 10,
            bonusPoints: 3,
            multipliedPoints: 39,
          }),
        }
      );
    });

    it('returns 0 when no scores exist', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(makeTournament());
      mockScoresCollection.find.mockReturnValue(toArrayHelper([]));

      const count = await recalculateScoresForTournament(tournamentId.toString());
      expect(count).toBe(0);
    });
  });
});
