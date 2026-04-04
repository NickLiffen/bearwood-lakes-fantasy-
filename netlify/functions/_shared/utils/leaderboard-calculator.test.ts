import { describe, it, expect, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import type {
  PickDocument,
  UserDocument,
  ScoreDocument,
  TournamentDocument,
} from '../models';
import {
  calculateLeaderboard,
  rankEntries,
  formatWeekLabel,
  formatMonthLabel,
  getMonthEnd,
  type LeaderboardRawEntry,
} from './leaderboard-calculator';

// Mock the dates module
vi.mock('./dates', () => ({
  getTeamEffectiveStartDate: vi.fn((createdAt: Date) => createdAt),
}));

// ────────────────────────────────────────────────────────────
// Mock data factories
// ────────────────────────────────────────────────────────────

function createObjectId(): ObjectId {
  return new ObjectId();
}

function createUser(overrides?: Partial<UserDocument>): UserDocument {
  const id = createObjectId();
  return {
    _id: id,
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    email: 'john@example.com',
    passwordHash: 'hash',
    phoneNumber: null,
    phoneVerified: false,
    role: 'user',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createPick(overrides?: Partial<PickDocument>): PickDocument {
  const userId = createObjectId();
  const golferIds = [createObjectId(), createObjectId(), createObjectId()];
  return {
    _id: createObjectId(),
    userId,
    golferIds,
    captainId: golferIds[0],
    totalSpent: 100,
    season: 2024,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createTournament(overrides?: Partial<TournamentDocument>): TournamentDocument {
  const startDate = new Date('2024-01-15');
  return {
    _id: createObjectId(),
    name: 'Test Tournament',
    startDate,
    endDate: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000),
    tournamentType: 'rollup_stableford',
    scoringFormat: 'stableford',
    isMultiDay: true,
    multiplier: 1,
    golferCountTier: '20+',
    season: 2024,
    status: 'completed',
    participatingGolferIds: [createObjectId(), createObjectId()],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createScore(
  overrides?: Partial<ScoreDocument> & { golferId?: ObjectId; tournamentId?: ObjectId },
): ScoreDocument {
  const { golferId, tournamentId, ...rest } = overrides || {};
  return {
    _id: createObjectId(),
    tournamentId: tournamentId || createObjectId(),
    golferId: golferId || createObjectId(),
    participated: true,
    position: 1,
    rawScore: -10,
    basePoints: 10,
    bonusPoints: 2,
    multipliedPoints: 12,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-20'),
    ...rest,
  };
}

// ────────────────────────────────────────────────────────────
// Tests: calculateLeaderboard
// ────────────────────────────────────────────────────────────

describe('calculateLeaderboard', () => {
  it('returns empty entries when no picks match', () => {
    const picks: PickDocument[] = [];
    const userMap = new Map<string, UserDocument>();
    const tournaments: TournamentDocument[] = [];
    const allScores: ScoreDocument[] = [];

    const periodStart = new Date('2024-01-01');
    const periodEnd = new Date('2024-01-31');

    const result = calculateLeaderboard(
      picks,
      userMap,
      tournaments,
      allScores,
      periodStart,
      periodEnd,
    );

    expect(result.entries).toEqual([]);
    expect(result.tournamentCount).toBe(0);
  });

  it('filters tournaments to the specified period', () => {
    const user = createUser();
    const userId = user._id;

    const pick = createPick({ userId });
    const golferId = pick.golferIds[0];

    const tournamentInPeriod = createTournament({
      startDate: new Date('2024-01-15'),
    });
    const tournamentBeforePeriod = createTournament({
      startDate: new Date('2023-12-31'),
    });
    const tournamentAfterPeriod = createTournament({
      startDate: new Date('2024-02-01'),
    });

    const score = createScore({
      golferId,
      tournamentId: tournamentInPeriod._id,
    });

    const userMap = new Map([[userId.toString(), user]]);
    const tournaments = [tournamentBeforePeriod, tournamentInPeriod, tournamentAfterPeriod];
    const allScores = [score];

    const periodStart = new Date('2024-01-01');
    const periodEnd = new Date('2024-01-31');

    const result = calculateLeaderboard([pick], userMap, tournaments, allScores, periodStart, periodEnd);

    expect(result.tournamentCount).toBe(1);
    expect(result.entries).toHaveLength(1);
  });

  it('applies captain 2x multiplier correctly', () => {
    const user = createUser();
    const userId = user._id;
    const golfer1 = createObjectId();
    const golfer2 = createObjectId();

    const pick = createPick({
      userId,
      golferIds: [golfer1, golfer2],
      captainId: golfer1,
    });

    const tournament = createTournament({ startDate: new Date('2024-01-15') });

    const captainScore = createScore({
      golferId: golfer1,
      tournamentId: tournament._id,
      multipliedPoints: 10,
    });

    const nonCaptainScore = createScore({
      golferId: golfer2,
      tournamentId: tournament._id,
      multipliedPoints: 8,
    });

    const userMap = new Map([[userId.toString(), user]]);
    const tournaments = [tournament];
    const allScores = [captainScore, nonCaptainScore];

    const periodStart = new Date('2024-01-01');
    const periodEnd = new Date('2024-01-31');

    const result = calculateLeaderboard(
      [pick],
      userMap,
      tournaments,
      allScores,
      periodStart,
      periodEnd,
    );

    // Captain: 10 * 2 = 20
    // Non-captain: 8 * 1 = 8
    // Total: 28
    expect(result.entries[0].points).toBe(28);
  });

  it('respects team effective start date (skips tournaments before it)', () => {
    const user = createUser();
    const userId = user._id;
    const golferId = createObjectId();

    const pickCreatedAt = new Date('2024-01-10');
    const pick = createPick({
      userId,
      golferIds: [golferId],
      createdAt: pickCreatedAt,
    });

    const tournamentBeforeStart = createTournament({
      startDate: new Date('2024-01-05'),
    });
    const tournamentAfterStart = createTournament({
      startDate: new Date('2024-01-15'),
    });

    const scoreBeforeStart = createScore({
      golferId,
      tournamentId: tournamentBeforeStart._id,
      multipliedPoints: 10,
    });
    const scoreAfterStart = createScore({
      golferId,
      tournamentId: tournamentAfterStart._id,
      multipliedPoints: 20,
    });

    const userMap = new Map([[userId.toString(), user]]);
    const tournaments = [tournamentBeforeStart, tournamentAfterStart];
    const allScores = [scoreBeforeStart, scoreAfterStart];

    const periodStart = new Date('2024-01-01');
    const periodEnd = new Date('2024-01-31');

    const result = calculateLeaderboard(
      [pick],
      userMap,
      tournaments,
      allScores,
      periodStart,
      periodEnd,
    );

    // Only the tournament after pick.createdAt should be counted
    expect(result.entries[0].points).toBe(20);
  });

  it('filters by memberSet when provided', () => {
    const user1 = createUser({ username: 'user1' });
    const user2 = createUser({ username: 'user2' });

    const pick1 = createPick({ userId: user1._id });
    const pick2 = createPick({ userId: user2._id });

    const userMap = new Map([
      [user1._id.toString(), user1],
      [user2._id.toString(), user2],
    ]);

    const memberSet = new Set([user1._id.toString()]);

    const result = calculateLeaderboard(
      [pick1, pick2],
      userMap,
      [],
      [],
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      undefined,
      memberSet,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].userId).toBe(user1._id.toString());
  });

  it('includes all picks when memberSet is omitted', () => {
    const user1 = createUser({ username: 'user1' });
    const user2 = createUser({ username: 'user2' });

    const pick1 = createPick({ userId: user1._id });
    const pick2 = createPick({ userId: user2._id });

    const userMap = new Map([
      [user1._id.toString(), user1],
      [user2._id.toString(), user2],
    ]);

    const result = calculateLeaderboard(
      [pick1, pick2],
      userMap,
      [],
      [],
      new Date('2024-01-01'),
      new Date('2024-01-31'),
    );

    expect(result.entries).toHaveLength(2);
  });

  it('counts tournaments correctly', () => {
    const user = createUser();
    const userId = user._id;
    const golferId = createObjectId();

    const pick = createPick({ userId, golferIds: [golferId] });

    const tournament1 = createTournament({ startDate: new Date('2024-01-05') });
    const tournament2 = createTournament({ startDate: new Date('2024-01-15') });
    const tournament3 = createTournament({ startDate: new Date('2024-01-25') });

    const userMap = new Map([[userId.toString(), user]]);
    const tournaments = [tournament1, tournament2, tournament3];
    const allScores: ScoreDocument[] = [];

    const periodStart = new Date('2024-01-01');
    const periodEnd = new Date('2024-01-31');

    const result = calculateLeaderboard(
      [pick],
      userMap,
      tournaments,
      allScores,
      periodStart,
      periodEnd,
    );

    expect(result.tournamentCount).toBe(3);
  });

  it('counts participated events correctly', () => {
    const user = createUser();
    const userId = user._id;
    const golferId = createObjectId();

    const pick = createPick({ userId, golferIds: [golferId] });

    const tournament1 = createTournament({ startDate: new Date('2024-01-05') });
    const tournament2 = createTournament({ startDate: new Date('2024-01-15') });
    const tournament3 = createTournament({ startDate: new Date('2024-01-25') });

    const score1 = createScore({
      golferId,
      tournamentId: tournament1._id,
      participated: true,
    });
    const score2 = createScore({
      golferId,
      tournamentId: tournament2._id,
      participated: true,
    });
    const score3 = createScore({
      golferId,
      tournamentId: tournament3._id,
      participated: false,
    });

    const userMap = new Map([[userId.toString(), user]]);
    const tournaments = [tournament1, tournament2, tournament3];
    const allScores = [score1, score2, score3];

    const periodStart = new Date('2024-01-01');
    const periodEnd = new Date('2024-01-31');

    const result = calculateLeaderboard(
      [pick],
      userMap,
      tournaments,
      allScores,
      periodStart,
      periodEnd,
    );

    expect(result.entries[0].events).toBe(2);
  });

  it('skips missing user from userMap', () => {
    const user = createUser();
    const userId = user._id;
    const unknownUserId = createObjectId();

    const pick1 = createPick({ userId });
    const pick2 = createPick({ userId: unknownUserId });

    const userMap = new Map([[userId.toString(), user]]);

    const result = calculateLeaderboard(
      [pick1, pick2],
      userMap,
      [],
      [],
      new Date('2024-01-01'),
      new Date('2024-01-31'),
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].userId).toBe(userId.toString());
  });
});

// ────────────────────────────────────────────────────────────
// Tests: rankEntries
// ────────────────────────────────────────────────────────────

describe('rankEntries', () => {
  it('ranks entries by points descending', () => {
    const user1 = createUser({ username: 'user1' });
    const user2 = createUser({ username: 'user2' });
    const user3 = createUser({ username: 'user3' });

    const entries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 50,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user2._id.toString(),
        user: user2,
        points: 100,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user3._id.toString(),
        user: user3,
        points: 75,
        teamValue: 100,
        events: 3,
      },
    ];

    const result = rankEntries(entries, null);

    expect(result[0].rank).toBe(1);
    expect(result[0].userId).toBe(user2._id.toString());
    expect(result[1].rank).toBe(2);
    expect(result[1].userId).toBe(user3._id.toString());
    expect(result[2].rank).toBe(3);
    expect(result[2].userId).toBe(user1._id.toString());
  });

  it('handles ties (same rank for same points)', () => {
    const user1 = createUser({ username: 'user1' });
    const user2 = createUser({ username: 'user2' });
    const user3 = createUser({ username: 'user3' });

    const entries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 100,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user2._id.toString(),
        user: user2,
        points: 100,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user3._id.toString(),
        user: user3,
        points: 50,
        teamValue: 100,
        events: 3,
      },
    ];

    const result = rankEntries(entries, null);

    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(3);
  });

  it('calculates movement as "up" when rank improves vs previous', () => {
    const user1 = createUser({ username: 'user1' });
    const user2 = createUser({ username: 'user2' });

    const previousEntries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 50,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user2._id.toString(),
        user: user2,
        points: 100,
        teamValue: 100,
        events: 3,
      },
    ];

    const currentEntries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 120,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user2._id.toString(),
        user: user2,
        points: 100,
        teamValue: 100,
        events: 3,
      },
    ];

    const result = rankEntries(currentEntries, previousEntries);

    const user1Entry = result.find((e) => e.userId === user1._id.toString())!;
    expect(user1Entry.movement).toBe('up');
    expect(user1Entry.movementAmount).toBe(1);
    expect(user1Entry.oldRank).toBe(2);
    expect(user1Entry.rank).toBe(1);
  });

  it('calculates movement as "down" when rank drops', () => {
    const user1 = createUser({ username: 'user1' });
    const user2 = createUser({ username: 'user2' });

    const previousEntries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 100,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user2._id.toString(),
        user: user2,
        points: 50,
        teamValue: 100,
        events: 3,
      },
    ];

    const currentEntries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 50,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user2._id.toString(),
        user: user2,
        points: 100,
        teamValue: 100,
        events: 3,
      },
    ];

    const result = rankEntries(currentEntries, previousEntries);

    const user1Entry = result.find((e) => e.userId === user1._id.toString())!;
    expect(user1Entry.movement).toBe('down');
    expect(user1Entry.movementAmount).toBe(1);
    expect(user1Entry.oldRank).toBe(1);
    expect(user1Entry.rank).toBe(2);
  });

  it('calculates movement as "same" when rank unchanged', () => {
    const user1 = createUser({ username: 'user1' });

    const previousEntries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 100,
        teamValue: 100,
        events: 3,
      },
    ];

    const currentEntries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 100,
        teamValue: 100,
        events: 3,
      },
    ];

    const result = rankEntries(currentEntries, previousEntries);

    expect(result[0].movement).toBe('same');
    expect(result[0].movementAmount).toBe(0);
    expect(result[0].oldRank).toBe(1);
    expect(result[0].rank).toBe(1);
  });

  it('marks as "new" when no previous entry exists', () => {
    const user1 = createUser({ username: 'user1' });

    const currentEntries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 100,
        teamValue: 100,
        events: 3,
      },
    ];

    const result = rankEntries(currentEntries, null);

    expect(result[0].movement).toBe('new');
    expect(result[0].movementAmount).toBe(0);
    expect(result[0].oldRank).toBeNull();
  });

  it('returns empty array for empty input', () => {
    const result = rankEntries([], null);
    expect(result).toEqual([]);
  });

  it('extracts user details into ranked entry', () => {
    const user = createUser({
      firstName: 'Alice',
      lastName: 'Smith',
      username: 'asmith',
    });

    const entries: LeaderboardRawEntry[] = [
      {
        userId: user._id.toString(),
        user,
        points: 100,
        teamValue: 95,
        events: 5,
      },
    ];

    const result = rankEntries(entries, null);

    expect(result[0].firstName).toBe('Alice');
    expect(result[0].lastName).toBe('Smith');
    expect(result[0].username).toBe('asmith');
    expect(result[0].teamValue).toBe(95);
    expect(result[0].eventsPlayed).toBe(5);
  });

  it('handles multiple users with various movements', () => {
    const user1 = createUser({ username: 'user1' });
    const user2 = createUser({ username: 'user2' });
    const user3 = createUser({ username: 'user3' });
    const user4 = createUser({ username: 'user4' });

    const previousEntries: LeaderboardRawEntry[] = [
      {
        userId: user1._id.toString(),
        user: user1,
        points: 100,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user2._id.toString(),
        user: user2,
        points: 80,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user3._id.toString(),
        user: user3,
        points: 60,
        teamValue: 100,
        events: 3,
      },
    ];

    const currentEntries: LeaderboardRawEntry[] = [
      {
        userId: user2._id.toString(),
        user: user2,
        points: 110,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user1._id.toString(),
        user: user1,
        points: 100,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user3._id.toString(),
        user: user3,
        points: 60,
        teamValue: 100,
        events: 3,
      },
      {
        userId: user4._id.toString(),
        user: user4,
        points: 50,
        teamValue: 100,
        events: 3,
      },
    ];

    const result = rankEntries(currentEntries, previousEntries);

    // user2: 2->1 (up 1)
    const user2Result = result.find((e) => e.userId === user2._id.toString())!;
    expect(user2Result.rank).toBe(1);
    expect(user2Result.oldRank).toBe(2);
    expect(user2Result.movement).toBe('up');
    expect(user2Result.movementAmount).toBe(1);

    // user1: 1->2 (down 1)
    const user1Result = result.find((e) => e.userId === user1._id.toString())!;
    expect(user1Result.rank).toBe(2);
    expect(user1Result.oldRank).toBe(1);
    expect(user1Result.movement).toBe('down');
    expect(user1Result.movementAmount).toBe(1);

    // user3: 3->3 (same)
    const user3Result = result.find((e) => e.userId === user3._id.toString())!;
    expect(user3Result.rank).toBe(3);
    expect(user3Result.oldRank).toBe(3);
    expect(user3Result.movement).toBe('same');

    // user4: new
    const user4Result = result.find((e) => e.userId === user4._id.toString())!;
    expect(user4Result.rank).toBe(4);
    expect(user4Result.oldRank).toBeNull();
    expect(user4Result.movement).toBe('new');
  });
});

// ────────────────────────────────────────────────────────────
// Tests: Helper functions
// ────────────────────────────────────────────────────────────

describe('formatWeekLabel', () => {
  it('formats week label with date range only', () => {
    const start = new Date('2024-01-08');
    const end = new Date('2024-01-14');

    const label = formatWeekLabel(start, end);

    expect(label).toBe('8 Jan - 14 Jan');
  });

  it('includes gameweek number when provided', () => {
    const start = new Date('2024-01-08');
    const end = new Date('2024-01-14');

    const label = formatWeekLabel(start, end, 5);

    expect(label).toBe('Gameweek 5: 8 Jan - 14 Jan');
  });

  it('omits gameweek number when zero', () => {
    const start = new Date('2024-01-08');
    const end = new Date('2024-01-14');

    const label = formatWeekLabel(start, end, 0);

    expect(label).toBe('8 Jan - 14 Jan');
  });

  it('omits gameweek number when negative', () => {
    const start = new Date('2024-01-08');
    const end = new Date('2024-01-14');

    const label = formatWeekLabel(start, end, -1);

    expect(label).toBe('8 Jan - 14 Jan');
  });

  it('handles month boundaries', () => {
    const start = new Date('2024-01-28');
    const end = new Date('2024-02-03');

    const label = formatWeekLabel(start, end, 1);

    expect(label).toBe('Gameweek 1: 28 Jan - 3 Feb');
  });
});

describe('formatMonthLabel', () => {
  it('returns correct format for January', () => {
    const date = new Date('2024-01-15');
    const label = formatMonthLabel(date);

    expect(label).toBe('January 2024');
  });

  it('returns correct format for December', () => {
    const date = new Date('2024-12-25');
    const label = formatMonthLabel(date);

    expect(label).toBe('December 2024');
  });

  it('returns correct format for any month', () => {
    const date = new Date('2024-06-10');
    const label = formatMonthLabel(date);

    expect(label).toBe('June 2024');
  });
});

describe('getMonthEnd', () => {
  it('returns last day of month with 23:59:59.999 for January', () => {
    const date = new Date('2024-01-15');
    const monthEnd = getMonthEnd(date);

    expect(monthEnd.getFullYear()).toBe(2024);
    expect(monthEnd.getMonth()).toBe(0); // January
    expect(monthEnd.getDate()).toBe(31);
    expect(monthEnd.getHours()).toBe(23);
    expect(monthEnd.getMinutes()).toBe(59);
    expect(monthEnd.getSeconds()).toBe(59);
    expect(monthEnd.getMilliseconds()).toBe(999);
  });

  it('returns last day of month for February in leap year', () => {
    const date = new Date('2024-02-10');
    const monthEnd = getMonthEnd(date);

    expect(monthEnd.getDate()).toBe(29);
    expect(monthEnd.getHours()).toBe(23);
    expect(monthEnd.getMinutes()).toBe(59);
    expect(monthEnd.getSeconds()).toBe(59);
    expect(monthEnd.getMilliseconds()).toBe(999);
  });

  it('returns last day of month for February in non-leap year', () => {
    const date = new Date('2023-02-10');
    const monthEnd = getMonthEnd(date);

    expect(monthEnd.getDate()).toBe(28);
    expect(monthEnd.getHours()).toBe(23);
    expect(monthEnd.getMinutes()).toBe(59);
    expect(monthEnd.getSeconds()).toBe(59);
    expect(monthEnd.getMilliseconds()).toBe(999);
  });

  it('returns correct last day for months with 30 days', () => {
    const date = new Date('2024-04-10');
    const monthEnd = getMonthEnd(date);

    expect(monthEnd.getDate()).toBe(30);
  });

  it('returns correct last day for months with 31 days', () => {
    const date = new Date('2024-12-10');
    const monthEnd = getMonthEnd(date);

    expect(monthEnd.getDate()).toBe(31);
  });
});
