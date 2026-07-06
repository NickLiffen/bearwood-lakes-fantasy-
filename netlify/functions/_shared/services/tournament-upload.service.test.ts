import { ObjectId } from 'mongodb';
import type { Db, MongoClient } from 'mongodb';
import { connectToDatabase } from '../db';
import { processTournamentUpload } from './tournament-upload.service';
import type { TournamentUploadInput } from '../validators/tournament-upload.validator';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

const mockGolfersCol = {
  find: vi.fn(),
  insertMany: vi.fn(),
  bulkWrite: vi.fn(),
};

const mockTournamentsCol = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  find: vi.fn(),
};

const mockScoresCol = {
  bulkWrite: vi.fn(),
  updateMany: vi.fn(),
  find: vi.fn(),
};

const mockSeasonsCol = {
  find: vi.fn(),
};

const cursor = <T>(items: T[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
  project: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
});

const insertManyResult = (docs: unknown[]) => ({
  insertedIds: Object.fromEntries(docs.map((_, i) => [i, new ObjectId()])),
});

const seasonDoc = {
  _id: new ObjectId(),
  name: '2025',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  isActive: true,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'golfers') return mockGolfersCol;
        if (name === 'tournaments') return mockTournamentsCol;
        if (name === 'scores') return mockScoresCol;
        if (name === 'seasons') return mockSeasonsCol;
        return {};
      }),
    } as unknown as Db,
    client: {} as unknown as MongoClient,
  });

  mockSeasonsCol.find.mockReturnValue(cursor([seasonDoc]));
  mockTournamentsCol.findOne.mockResolvedValue(null);
  mockTournamentsCol.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
  mockTournamentsCol.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mockTournamentsCol.find.mockReturnValue(cursor([{ _id: new ObjectId() }]));
  mockGolfersCol.find.mockReturnValue(cursor([]));
  mockGolfersCol.insertMany.mockImplementation((docs: unknown[]) =>
    Promise.resolve(insertManyResult(docs))
  );
  mockGolfersCol.bulkWrite.mockResolvedValue({ modifiedCount: 0 });
  mockScoresCol.bulkWrite.mockResolvedValue({ upsertedCount: 0 });
  mockScoresCol.updateMany.mockResolvedValue({ modifiedCount: 0 });
  mockScoresCol.find.mockReturnValue(cursor([]));
});

const baseInput = (golfers: TournamentUploadInput['golfers']): TournamentUploadInput => ({
  name: 'Club Championship',
  date: '2025-06-15',
  tournamentType: 'rollup_stableford',
  scoringFormat: 'stableford',
  isMultiDay: false,
  golfers,
});

describe('tournament-upload.service', () => {
  it('creates a tournament, golfers, and scores', async () => {
    const result = await processTournamentUpload(
      baseInput([
        { position: 1, firstName: 'Tiger', lastName: 'Woods', rawScore: 40 },
        { position: 2, firstName: 'Rory', lastName: 'McIlroy', rawScore: 38 },
      ])
    );

    expect(result.tournamentCreated).toBe(true);
    expect(result.golfersCreated).toBe(2);
    expect(result.scoresEntered).toBe(2);
    expect(result.summary).toContain('created');
  });

  it('is idempotent: re-uploading updates the existing tournament', async () => {
    mockTournamentsCol.findOne.mockResolvedValue({
      _id: new ObjectId(),
      name: 'Club Championship',
      status: 'complete',
    });

    const result = await processTournamentUpload(
      baseInput([{ position: 1, firstName: 'Tiger', lastName: 'Woods', rawScore: 40 }])
    );

    expect(result.tournamentCreated).toBe(false);
    expect(result.summary).toContain('updated');
    expect(mockTournamentsCol.insertOne).not.toHaveBeenCalled();
  });

  it('throws when no season covers the tournament date', async () => {
    mockSeasonsCol.find.mockReturnValue(
      cursor([
        { ...seasonDoc, startDate: new Date('2024-01-01'), endDate: new Date('2024-12-31') },
      ])
    );

    await expect(
      processTournamentUpload(
        baseInput([{ position: 1, firstName: 'Tiger', lastName: 'Woods', rawScore: 40 }])
      )
    ).rejects.toThrow(/No season found/);
  });

  it('dedupes duplicate golfers within the payload (last wins)', async () => {
    const result = await processTournamentUpload(
      baseInput([
        { position: 5, firstName: 'Tiger', lastName: 'Woods', rawScore: 30 },
        { position: 1, firstName: 'Tiger', lastName: 'Woods', rawScore: 40 },
      ])
    );

    expect(result.scoresEntered).toBe(1);
    const ops = mockScoresCol.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.update.$set.position).toBe(1);
  });

  it('processes a 400-golfer field with a bounded number of DB round-trips', async () => {
    const golfers = Array.from({ length: 400 }, (_, i) => ({
      position: i + 1,
      firstName: `Player${i}`,
      lastName: `Surname${i}`,
      rawScore: 36,
    }));

    const result = await processTournamentUpload(baseInput(golfers));

    expect(result.golfersCreated).toBe(400);
    expect(result.scoresEntered).toBe(400);
    expect(mockGolfersCol.find).toHaveBeenCalledTimes(1);
    expect(mockGolfersCol.insertMany).toHaveBeenCalledTimes(1);
    expect(mockScoresCol.bulkWrite).toHaveBeenCalledTimes(1);
    expect(mockScoresCol.updateMany).toHaveBeenCalledTimes(1);
  });
});
