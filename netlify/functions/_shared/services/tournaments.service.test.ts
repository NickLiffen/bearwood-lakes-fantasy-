import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  getAllTournaments,
  getTournamentsBySeason,
  getTournamentsByStatus,
  getTournamentById,
  createTournament,
  updateTournament,
  deleteTournament,
  publishTournament,
  completeTournament,
} from './tournaments.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('./seasons.service', () => ({
  getActiveSeason: vi.fn().mockResolvedValue({ id: '1', name: '2025', isActive: true }),
}));

const mockTournamentsCollection = {
  find: vi.fn(),
  findOne: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
};

const toArraySorted = (items: any[]) => ({
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
  toArray: vi.fn().mockResolvedValue(items),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockReturnValue(mockTournamentsCollection),
    } as any,
    client: {} as any,
  });
});

describe('tournaments.service', () => {
  const tournamentId = new ObjectId();
  const tournamentDoc = {
    _id: tournamentId,
    name: 'Spring Medal',
    startDate: new Date('2025-04-15'),
    endDate: new Date('2025-04-15'),
    tournamentType: 'weekend_medal',
    scoringFormat: 'medal',
    isMultiDay: false,
    multiplier: 2,
    golferCountTier: '20+',
    season: 2025,
    status: 'draft',
    participatingGolferIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('getAllTournaments', () => {
    it('returns all tournaments sorted by start date', async () => {
      mockTournamentsCollection.find.mockReturnValue(toArraySorted([tournamentDoc]));

      const result = await getAllTournaments();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Spring Medal');
    });
  });

  describe('getTournamentsBySeason', () => {
    it('returns tournaments for specified season', async () => {
      mockTournamentsCollection.find.mockReturnValue(toArraySorted([tournamentDoc]));

      const result = await getTournamentsBySeason(2025);

      expect(result).toHaveLength(1);
      expect(mockTournamentsCollection.find).toHaveBeenCalledWith({ season: 2025 });
    });

    it('defaults to active season when no season specified', async () => {
      mockTournamentsCollection.find.mockReturnValue(toArraySorted([tournamentDoc]));

      await getTournamentsBySeason();

      expect(mockTournamentsCollection.find).toHaveBeenCalledWith({ season: 2025 });
    });
  });

  describe('getTournamentsByStatus', () => {
    it('returns tournaments matching status', async () => {
      mockTournamentsCollection.find.mockReturnValue(toArraySorted([tournamentDoc]));

      const result = await getTournamentsByStatus('draft');

      expect(result).toHaveLength(1);
      expect(mockTournamentsCollection.find).toHaveBeenCalledWith({ status: 'draft' });
    });
  });

  describe('getTournamentById', () => {
    it('returns tournament when found', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(tournamentDoc);

      const result = await getTournamentById(tournamentId.toString());

      expect(result!.name).toBe('Spring Medal');
    });

    it('returns null when not found', async () => {
      mockTournamentsCollection.findOne.mockResolvedValue(null);

      const result = await getTournamentById(new ObjectId().toString());

      expect(result).toBeNull();
    });
  });

  describe('createTournament', () => {
    it('creates a tournament with correct multiplier from type config', async () => {
      const insertedId = new ObjectId();
      mockTournamentsCollection.insertOne.mockResolvedValue({ insertedId });

      const result = await createTournament({
        name: 'Weekend Medal',
        startDate: '2025-05-01',
        endDate: '2025-05-01',
        tournamentType: 'weekend_medal',
      });

      expect(result.multiplier).toBe(2);
      expect(result.scoringFormat).toBe('medal');
      expect(result.status).toBe('draft');
    });

    it('creates a rollup stableford with 1x multiplier by default', async () => {
      const insertedId = new ObjectId();
      mockTournamentsCollection.insertOne.mockResolvedValue({ insertedId });

      const result = await createTournament({
        name: 'Saturday Rollup',
        startDate: '2025-05-03',
        endDate: '2025-05-03',
      });

      expect(result.multiplier).toBe(1);
      expect(result.tournamentType).toBe('rollup_stableford');
      expect(result.scoringFormat).toBe('stableford');
    });

    it('creates a founders tournament with 4x multiplier', async () => {
      const insertedId = new ObjectId();
      mockTournamentsCollection.insertOne.mockResolvedValue({ insertedId });

      const result = await createTournament({
        name: 'Founders Trophy',
        startDate: '2025-06-01',
        endDate: '2025-06-02',
        tournamentType: 'founders',
      });

      expect(result.multiplier).toBe(4);
      expect(result.isMultiDay).toBe(true);
    });
  });

  describe('updateTournament', () => {
    it('updates tournament fields', async () => {
      mockTournamentsCollection.findOneAndUpdate.mockResolvedValue({
        ...tournamentDoc,
        name: 'Renamed',
      });

      const result = await updateTournament(tournamentId.toString(), { name: 'Renamed' });

      expect(result!.name).toBe('Renamed');
    });

    it('updates multiplier when tournament type changes', async () => {
      mockTournamentsCollection.findOneAndUpdate.mockResolvedValue({
        ...tournamentDoc,
        tournamentType: 'presidents_cup',
        multiplier: 3,
      });

      const result = await updateTournament(tournamentId.toString(), {
        tournamentType: 'presidents_cup',
      });

      expect(result!.multiplier).toBe(3);
      expect(mockTournamentsCollection.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        {
          $set: expect.objectContaining({
            tournamentType: 'presidents_cup',
            multiplier: 3,
          }),
        },
        expect.any(Object)
      );
    });

    it('returns null when tournament not found', async () => {
      mockTournamentsCollection.findOneAndUpdate.mockResolvedValue(null);

      const result = await updateTournament(new ObjectId().toString(), { name: 'X' });

      expect(result).toBeNull();
    });
  });

  describe('deleteTournament', () => {
    it('returns true on successful deletion', async () => {
      mockTournamentsCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await deleteTournament(tournamentId.toString());

      expect(result).toBe(true);
    });

    it('returns false when tournament not found', async () => {
      mockTournamentsCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await deleteTournament(new ObjectId().toString());

      expect(result).toBe(false);
    });
  });

  describe('publishTournament', () => {
    it('sets status to published', async () => {
      mockTournamentsCollection.findOneAndUpdate.mockResolvedValue({
        ...tournamentDoc,
        status: 'published',
      });

      const result = await publishTournament(tournamentId.toString());

      expect(result!.status).toBe('published');
    });
  });

  describe('completeTournament', () => {
    it('sets status to complete', async () => {
      mockTournamentsCollection.findOneAndUpdate.mockResolvedValue({
        ...tournamentDoc,
        status: 'complete',
      });

      const result = await completeTournament(tournamentId.toString());

      expect(result!.status).toBe('complete');
    });
  });
});
