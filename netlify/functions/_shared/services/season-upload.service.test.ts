import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { processSeasonUpload } from './season-upload.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

const mockGolfersCol = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
};

const mockTournamentsCol = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  find: vi.fn(),
};

const mockScoresCol = {
  updateOne: vi.fn(),
  find: vi.fn(),
};

const mockSeasonsCol = {
  find: vi.fn(),
};

const toArraySorted = (items: any[]) => ({
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
  toArray: vi.fn().mockResolvedValue(items),
  project: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
});

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
    } as any,
    client: {} as any,
  });
});

describe('season-upload.service', () => {
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
    mockSeasonsCol.find.mockReturnValue(toArraySorted([seasonDoc]));
    // Default: tournament not found (will be created)
    mockTournamentsCol.findOne.mockResolvedValue(null);
    mockTournamentsCol.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    mockTournamentsCol.updateOne.mockResolvedValue({ modifiedCount: 1 });
    // Default: golfer not found (will be created)
    mockGolfersCol.findOne.mockResolvedValue(null);
    let golferInsertCount = 0;
    mockGolfersCol.insertOne.mockImplementation(() => {
      golferInsertCount++;
      return Promise.resolve({ insertedId: new ObjectId() });
    });
    mockGolfersCol.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockScoresCol.updateOne.mockResolvedValue({ modifiedCount: 1 });
    // For stats recalculation
    mockTournamentsCol.find.mockReturnValue(
      toArraySorted([{ _id: new ObjectId() }])
    );
    mockScoresCol.find.mockReturnValue(toArraySorted([]));
  });

  it('parses comma-delimited CSV and creates golfers/tournaments/scores', async () => {
    const csv = [
      'date,position,player,rawScore,tournamentType,scoringFormat,isMultiDay',
      '15/06/2025,1,Tiger Woods,38,rollup_stableford,stableford,No',
      '15/06/2025,2,Rory McIlroy,35,rollup_stableford,stableford,No',
    ].join('\n');

    const result = await processSeasonUpload(csv);

    expect(result.golfersCreated).toBe(2);
    expect(result.tournamentsCreated).toBe(1);
    expect(result.scoresEntered).toBe(2);
    expect(result.summary).toContain('Processed 2 rows');
  });

  it('parses tab-delimited CSV', async () => {
    const csv = [
      'date\tposition\tplayer\trawScore\ttournamentType\tscoringFormat\tisMultiDay',
      '15/06/2025\t1\tTiger Woods\t38\trollup_stableford\tstableford\tNo',
    ].join('\n');

    const result = await processSeasonUpload(csv);

    expect(result.scoresEntered).toBe(1);
  });

  it('handles existing golfers by matching', async () => {
    const existingGolferId = new ObjectId();
    mockGolfersCol.findOne.mockResolvedValue({
      _id: existingGolferId,
      firstName: 'Tiger',
      lastName: 'Woods',
    });

    const csv = [
      'date,position,player,rawScore,tournamentType,scoringFormat,isMultiDay',
      '15/06/2025,1,Tiger Woods,38,rollup_stableford,stableford,No',
    ].join('\n');

    const result = await processSeasonUpload(csv);

    expect(result.golfersCreated).toBe(0);
    expect(result.golfersUpdated).toBe(1);
    expect(mockGolfersCol.insertOne).not.toHaveBeenCalled();
  });

  it('handles existing tournaments', async () => {
    mockTournamentsCol.findOne.mockResolvedValue({
      _id: new ObjectId(),
      name: '15/06/2025 Tournament',
    });

    const csv = [
      'date,position,player,rawScore,tournamentType,scoringFormat,isMultiDay',
      '15/06/2025,1,Tiger Woods,38,rollup_stableford,stableford,No',
    ].join('\n');

    const result = await processSeasonUpload(csv);

    expect(result.tournamentsCreated).toBe(0);
  });

  it('warns about dates not matching any season', async () => {
    mockSeasonsCol.find.mockReturnValue(
      toArraySorted([
        {
          ...seasonDoc,
          startDate: new Date('2025-06-01'),
          endDate: new Date('2025-10-31'),
        },
      ])
    );

    const csv = [
      'date,position,player,rawScore,tournamentType,scoringFormat,isMultiDay',
      '15/01/2025,1,Tiger Woods,38,rollup_stableford,stableford,No',
    ].join('\n');

    const result = await processSeasonUpload(csv);

    expect(result.scoresEntered).toBe(0);
    expect(result.summary).toContain('Warning');
    expect(result.summary).toContain('15/01/2025');
  });

  it('skips empty and short lines', async () => {
    const csv = [
      'date,position,player,rawScore,tournamentType,scoringFormat,isMultiDay',
      '',
      '  ',
      'bad,line',
      '15/06/2025,1,Tiger Woods,38,rollup_stableford,stableford,No',
    ].join('\n');

    const result = await processSeasonUpload(csv);

    expect(result.scoresEntered).toBe(1);
  });

  it('supports YYYY-MM-DD date format', async () => {
    const csv = [
      'date,position,player,rawScore,tournamentType,scoringFormat,isMultiDay',
      '2025-06-15,1,Tiger Woods,38,rollup_stableford,stableford,No',
    ].join('\n');

    const result = await processSeasonUpload(csv);

    expect(result.scoresEntered).toBe(1);
  });

  it('handles quoted values in CSV', async () => {
    const csv = [
      'date,position,player,rawScore,tournamentType,scoringFormat,isMultiDay',
      '"15/06/2025","1","Tiger Woods","38","rollup_stableford","stableford","No"',
    ].join('\n');

    const result = await processSeasonUpload(csv);

    expect(result.scoresEntered).toBe(1);
  });
});
