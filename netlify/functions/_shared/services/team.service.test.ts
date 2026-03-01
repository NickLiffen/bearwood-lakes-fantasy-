import { ObjectId, type Db } from 'mongodb';
import { getTeamGolferScores, getTeamTransferHistory } from './team.service';
import type { GolferDocument } from '../models/Golfer';
import type { TournamentDocument } from '../models/Tournament';
import type { ScoreDocument } from '../models/Score';

vi.mock('../utils/dates', () => ({
  getWeekStart: vi.fn().mockImplementation((d: Date) => {
    const date = new Date(d);
    date.setDate(date.getDate() - ((date.getDay() + 1) % 7));
    date.setHours(0, 0, 0, 0);
    return date;
  }),
  getWeekEnd: vi.fn().mockImplementation((ws: Date) => {
    const end = new Date(ws);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }),
  getMonthStart: vi
    .fn()
    .mockImplementation(
      (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1),
    ),
  getMonthEnd: vi
    .fn()
    .mockImplementation(
      (d: Date) =>
        new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    ),
  getTeamEffectiveStartDate: vi
    .fn()
    .mockImplementation((d: Date) => new Date(d)),
  getSeasonFirstSaturday: vi.fn().mockImplementation((d: Date) => {
    const date = new Date(d);
    while (date.getDay() !== 6) date.setDate(date.getDate() + 1);
    return date;
  }),
}));

// Helpers
const golferId1 = new ObjectId();
const golferId2 = new ObjectId();
const tournamentId1 = new ObjectId();
const tournamentId2 = new ObjectId();

function makeGolfer(id: ObjectId, first: string, last: string): GolferDocument {
  return {
    _id: id,
    firstName: first,
    lastName: last,
    picture: '',
    price: 10_000_000,
    isActive: true,
    stats2024: {} as any,
    stats2025: {} as any,
    stats2026: {} as any,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };
}

function makeTournament(
  id: ObjectId,
  name: string,
  startDate: Date,
): TournamentDocument {
  return {
    _id: id,
    name,
    startDate,
    endDate: startDate,
    tournamentType: 'rollup_stableford',
    scoringFormat: 'stableford',
    isMultiDay: false,
    multiplier: 1,
    golferCountTier: '20+',
    season: 2025,
    status: 'published',
    participatingGolferIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as TournamentDocument;
}

function makeScore(
  gId: ObjectId,
  tId: ObjectId,
  multipliedPoints: number,
): ScoreDocument {
  return {
    _id: new ObjectId(),
    golferId: gId,
    tournamentId: tId,
    participated: true,
    position: 1,
    rawScore: -5,
    basePoints: multipliedPoints,
    bonusPoints: 0,
    multipliedPoints,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('getTeamGolferScores', () => {
  // Use a known date range for the selected week — Saturday Jan 4 to Friday Jan 10 2025
  const selectedWeekStart = new Date('2025-01-04T00:00:00.000Z');
  const selectedWeekEnd = new Date('2025-01-10T23:59:59.999Z');
  const seasonStartDate = new Date('2025-01-01');
  const teamEffectiveStart = new Date('2025-01-01');

  it('computes week, month, and season points for golfers', () => {
    const golfers = [makeGolfer(golferId1, 'Rory', 'McIlroy')];
    // Tournament within the selected week
    const tournaments = [
      makeTournament(tournamentId1, 'The Masters', new Date('2025-01-05')),
    ];
    const scores = [makeScore(golferId1, tournamentId1, 50)];

    const result = getTeamGolferScores(
      golfers,
      tournaments,
      scores,
      seasonStartDate,
      null,
      selectedWeekStart,
      selectedWeekEnd,
      teamEffectiveStart,
    );

    expect(result).toHaveLength(1);
    expect(result[0].weekPoints).toBe(50);
    expect(result[0].monthPoints).toBe(50);
    expect(result[0].seasonPoints).toBe(50);
    expect(result[0].isCaptain).toBe(false);
    expect(result[0].weekScores).toHaveLength(1);
    expect(result[0].weekScores[0].tournamentName).toBe('The Masters');
  });

  it('applies captain 2x multiplier', () => {
    const golfers = [makeGolfer(golferId1, 'Rory', 'McIlroy')];
    const tournaments = [
      makeTournament(tournamentId1, 'PGA', new Date('2025-01-05')),
    ];
    const scores = [makeScore(golferId1, tournamentId1, 40)];

    const result = getTeamGolferScores(
      golfers,
      tournaments,
      scores,
      seasonStartDate,
      golferId1.toString(), // captain
      selectedWeekStart,
      selectedWeekEnd,
      teamEffectiveStart,
    );

    expect(result[0].isCaptain).toBe(true);
    expect(result[0].weekPoints).toBe(80); // 40 * 2
    expect(result[0].seasonPoints).toBe(80);
  });

  it('excludes scores before teamEffectiveStart', () => {
    const lateTeamStart = new Date('2025-01-06');
    const golfers = [makeGolfer(golferId1, 'Rory', 'McIlroy')];
    const tournaments = [
      makeTournament(tournamentId1, 'Early T', new Date('2025-01-05')),
    ];
    const scores = [makeScore(golferId1, tournamentId1, 100)];

    const result = getTeamGolferScores(
      golfers,
      tournaments,
      scores,
      seasonStartDate,
      null,
      selectedWeekStart,
      selectedWeekEnd,
      lateTeamStart,
    );

    expect(result[0].weekPoints).toBe(0);
    expect(result[0].seasonPoints).toBe(0);
  });

  it('separates week vs season scores correctly', () => {
    const golfers = [makeGolfer(golferId1, 'Rory', 'McIlroy')];
    const tournaments = [
      makeTournament(tournamentId1, 'This Week', new Date('2025-01-06')),
      makeTournament(tournamentId2, 'Last Month', new Date('2025-02-15')),
    ];
    const scores = [
      makeScore(golferId1, tournamentId1, 30),
      makeScore(golferId1, tournamentId2, 70),
    ];

    const result = getTeamGolferScores(
      golfers,
      tournaments,
      scores,
      seasonStartDate,
      null,
      selectedWeekStart,
      selectedWeekEnd,
      teamEffectiveStart,
    );

    expect(result[0].weekPoints).toBe(30);
    expect(result[0].seasonPoints).toBe(100); // both tournaments in season
  });

  it('sorts golfers by week points descending', () => {
    const golfers = [
      makeGolfer(golferId1, 'Low', 'Scorer'),
      makeGolfer(golferId2, 'High', 'Scorer'),
    ];
    const tournaments = [
      makeTournament(tournamentId1, 'T1', new Date('2025-01-06')),
    ];
    const scores = [
      makeScore(golferId1, tournamentId1, 10),
      makeScore(golferId2, tournamentId1, 90),
    ];

    const result = getTeamGolferScores(
      golfers,
      tournaments,
      scores,
      seasonStartDate,
      null,
      selectedWeekStart,
      selectedWeekEnd,
      teamEffectiveStart,
    );

    expect(result[0].golfer.firstName).toBe('High');
    expect(result[1].golfer.firstName).toBe('Low');
  });

  it('returns zero points for golfers with no scores', () => {
    const golfers = [makeGolfer(golferId1, 'No', 'Scores')];
    const result = getTeamGolferScores(
      golfers,
      [],
      [],
      seasonStartDate,
      null,
      selectedWeekStart,
      selectedWeekEnd,
      teamEffectiveStart,
    );

    expect(result[0].weekPoints).toBe(0);
    expect(result[0].seasonPoints).toBe(0);
    expect(result[0].weekScores).toHaveLength(0);
  });
});

describe('getTeamTransferHistory', () => {
  const golferA = new ObjectId();
  const golferB = new ObjectId();
  const golferC = new ObjectId();
  const userId = new ObjectId().toString();

  function makeMockDb(
    pickHistory: any[],
    historyGolfers: any[],
  ): Db {
    const cursorChain = {
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue(pickHistory),
    };
    const golferCursorChain = {
      project: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue(historyGolfers),
    };
    return {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'pickHistory') {
          return { find: vi.fn().mockReturnValue(cursorChain) };
        }
        if (name === 'golfers') {
          return { find: vi.fn().mockReturnValue(golferCursorChain) };
        }
        return {};
      }),
    } as unknown as Db;
  }

  it('formats transfer history with added/removed golfers', async () => {
    const pickHistory = [
      {
        userId: new ObjectId(userId),
        season: 2025,
        golferIds: [golferA, golferB],
        totalSpent: 20_000_000,
        reason: 'transfer',
        changedAt: new Date('2025-02-01'),
      },
      {
        userId: new ObjectId(userId),
        season: 2025,
        golferIds: [golferA, golferC],
        totalSpent: 18_000_000,
        reason: 'initial',
        changedAt: new Date('2025-01-05'),
      },
    ];

    const historyGolfers = [
      { _id: golferA, firstName: 'Rory', lastName: 'McIlroy' },
      { _id: golferB, firstName: 'Tiger', lastName: 'Woods' },
      { _id: golferC, firstName: 'Phil', lastName: 'Mickelson' },
    ];

    const db = makeMockDb(pickHistory, historyGolfers);
    const result = await getTeamTransferHistory(db, userId, 2025);

    expect(result).toHaveLength(2);

    // First entry (transfer): added B, removed C
    const transfer = result[0];
    expect(transfer.reason).toBe('transfer');
    expect(transfer.addedGolfers).toEqual([
      { id: golferB.toString(), name: 'Tiger Woods' },
    ]);
    expect(transfer.removedGolfers).toEqual([
      { id: golferC.toString(), name: 'Phil Mickelson' },
    ]);

    // Second entry (initial): added A and C (no previous)
    const initial = result[1];
    expect(initial.reason).toBe('initial');
    expect(initial.addedGolfers).toHaveLength(2);
    expect(initial.removedGolfers).toHaveLength(0);
  });

  it('returns empty array when no pick history', async () => {
    const db = makeMockDb([], []);
    const result = await getTeamTransferHistory(db, userId, 2025);
    expect(result).toEqual([]);
  });

  it('filters out entries with no added or removed golfers', async () => {
    const pickHistory = [
      {
        userId: new ObjectId(userId),
        season: 2025,
        golferIds: [golferA],
        totalSpent: 10_000_000,
        reason: 'transfer',
        changedAt: new Date('2025-02-01'),
      },
      {
        userId: new ObjectId(userId),
        season: 2025,
        golferIds: [golferA],
        totalSpent: 10_000_000,
        reason: 'initial',
        changedAt: new Date('2025-01-05'),
      },
    ];

    const historyGolfers = [
      { _id: golferA, firstName: 'Rory', lastName: 'McIlroy' },
    ];

    const db = makeMockDb(pickHistory, historyGolfers);
    const result = await getTeamTransferHistory(db, userId, 2025);

    // First entry: same golfers as previous → 0 added, 0 removed → filtered out
    // Second entry (initial): golferA added → kept
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('initial');
  });
});
