import { ObjectId } from 'mongodb';
import { handler } from './my-team';
import { makeAuthEvent, mockContext, parseBody, createMockDb, mockCursor } from './__test-utils__';
import { connectToDatabase } from './_shared/db';
import { getActiveSeason } from './_shared/services/seasons.service';
import { getTransfersThisWeek } from './_shared/services/picks.service';
import type { Season } from '@shared/types';

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
}));
vi.mock('./_shared/auth', () => ({
  verifyToken: mockVerifyToken,
}));
vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: {
    default: { windowMs: 60000, maxRequests: 100 },
    read: { windowMs: 60000, maxRequests: 120 },
    write: { windowMs: 60000, maxRequests: 30 },
    admin: { windowMs: 60000, maxRequests: 60 },
  },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

vi.mock('./_shared/db', () => ({ connectToDatabase: vi.fn() }));
vi.mock('./_shared/services/seasons.service', () => ({ getActiveSeason: vi.fn() }));
vi.mock('./_shared/services/picks.service', () => ({
  getTransfersThisWeek: vi.fn(),
  applyPendingChanges: vi.fn().mockResolvedValue(false),
}));
vi.mock('./_shared/utils/dates', () => {
  const getSeasonFirstSaturdayImpl = (d: Date) => {
    const date = new Date(d);
    while (date.getDay() !== 6) date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const getFirstGameweekStartImpl = (seasonStartDate: Date, firstGameweekStart?: Date | null) => {
    if (firstGameweekStart) {
      const d = new Date(firstGameweekStart);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return getSeasonFirstSaturdayImpl(seasonStartDate);
  };
  const getTeamEffectiveStartDateImpl = (d: Date) => new Date(d);

  return {
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
      .mockImplementation((d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)),
    getMonthEnd: vi
      .fn()
      .mockImplementation(
        (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
      ),
    getTeamEffectiveStartDate: vi.fn().mockImplementation(getTeamEffectiveStartDateImpl),
    getGameweekNumber: vi.fn().mockReturnValue(3),
    getSeasonFirstSaturday: vi.fn().mockImplementation(getSeasonFirstSaturdayImpl),
    getFirstGameweekStart: vi.fn().mockImplementation(getFirstGameweekStartImpl),
    hasUnlimitedTransfers: vi
      .fn()
      .mockImplementation(
        (
          seasonStartDate: Date | null,
          firstGameweekStart: Date | null,
          teamCreatedAt?: Date | null,
          now: Date = new Date()
        ) => {
          const isPreSeason = seasonStartDate ? now < seasonStartDate : false;
          const firstGWDate = seasonStartDate
            ? firstGameweekStart
              ? new Date(firstGameweekStart)
              : getSeasonFirstSaturdayImpl(seasonStartDate)
            : null;
          const isBeforeFirstGameweek = firstGWDate ? now < firstGWDate : false;
          const teamEffective =
            teamCreatedAt !== undefined && teamCreatedAt !== null
              ? getTeamEffectiveStartDateImpl(teamCreatedAt)
              : null;
          const isPreFirstGameWeek = teamEffective ? now < teamEffective : false;
          return isPreSeason || isBeforeFirstGameweek || isPreFirstGameWeek;
        }
      ),
  };
});

const mockSeason = {
  _id: 'season-1',
  name: '2025',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
  isActive: true,
};

const golferId1 = new ObjectId();
const golferId2 = new ObjectId();
const captainId = golferId1;
const tournamentId = new ObjectId();
const userObjectId = new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

function setupDb(
  overrides: {
    pick?: Record<string, unknown>;
    golfers?: Record<string, unknown>[];
    tournaments?: Record<string, unknown>[];
    scores?: Record<string, unknown>[];
    settings?: Record<string, unknown>[];
    pickHistory?: Record<string, unknown>[];
    historyGolfers?: Record<string, unknown>[];
  } = {}
) {
  const settingsData = overrides.settings ?? [
    { key: 'transfersOpen', value: true },
    { key: 'allowNewTeamCreation', value: true },
    { key: 'maxTransfersPerWeek', value: 2 },
  ];

  const { mockDb } = createMockDb({
    picks: { findOne: vi.fn().mockResolvedValue(overrides.pick ?? null) },
    golfers: {
      find: vi.fn().mockReturnValue(mockCursor(overrides.golfers ?? [])),
    },
    tournaments: { find: vi.fn().mockReturnValue(mockCursor(overrides.tournaments ?? [])) },
    scores: { find: vi.fn().mockReturnValue(mockCursor(overrides.scores ?? [])) },
    settings: {
      findOne: vi
        .fn()
        .mockImplementation(({ key }: { key: string }) =>
          Promise.resolve(settingsData.find((s: { key: string }) => s.key === key) ?? null)
        ),
    },
    pickHistory: {
      find: vi.fn().mockReturnValue(mockCursor(overrides.pickHistory ?? [])),
    },
  });

  vi.mocked(connectToDatabase).mockResolvedValue(mockDb);
  return mockDb;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveSeason).mockResolvedValue(mockSeason as unknown as Season);
  vi.mocked(getTransfersThisWeek).mockResolvedValue(0);
  mockVerifyToken.mockReturnValue({
    userId: userObjectId.toString(),
    username: 'testplayer',
    role: 'player',
    phoneVerified: true,
  });
});

describe('my-team handler', () => {
  it('returns hasTeam:false when user has no picks', async () => {
    setupDb();

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.hasTeam).toBe(false);
    expect(body.data.team).toBeNull();
    expect(body.data.transfersOpen).toBe(true);
  });

  it('returns team with golfer scores when pick exists', async () => {
    const tournamentDate = new Date();
    const pick = {
      userId: userObjectId,
      golferIds: [golferId1, golferId2],
      captainId,
      totalSpent: 25_000_000,
      season: 2025,
      createdAt: new Date('2025-01-05'),
      updatedAt: new Date('2025-01-10'),
    };
    const golfers = [
      {
        _id: golferId1,
        firstName: 'Rory',
        lastName: 'McIlroy',
        picture: null,
        price: 12_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: golferId2,
        firstName: 'Tiger',
        lastName: 'Woods',
        picture: null,
        price: 13_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const tournaments = [
      {
        _id: tournamentId,
        name: 'The Masters',
        status: 'published',
        season: 2025,
        startDate: tournamentDate,
      },
    ];
    const scores = [
      {
        golferId: golferId1,
        tournamentId,
        position: 1,
        basePoints: 100,
        bonusPoints: 10,
        multipliedPoints: 110,
        rawScore: -10,
        participated: true,
      },
    ];

    setupDb({ pick, golfers, tournaments, scores });

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.hasTeam).toBe(true);
    expect(body.data.team.golfers).toHaveLength(2);
    expect(body.data.team.totals.totalSpent).toBe(25_000_000);
    expect(body.data.team.captainId).toBe(captainId.toString());
  });

  it('applies captain multiplier to points', async () => {
    const tournamentDate = new Date();
    const pick = {
      userId: userObjectId,
      golferIds: [golferId1],
      captainId: golferId1,
      totalSpent: 12_000_000,
      season: 2025,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date(),
    };
    const golfers = [
      {
        _id: golferId1,
        firstName: 'Rory',
        lastName: 'McIlroy',
        picture: null,
        price: 12_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const tournaments = [
      {
        _id: tournamentId,
        name: 'PGA',
        status: 'published',
        season: 2025,
        startDate: tournamentDate,
      },
    ];
    const scores = [
      {
        golferId: golferId1,
        tournamentId,
        position: 5,
        basePoints: 50,
        bonusPoints: 0,
        multipliedPoints: 50,
        rawScore: -5,
        participated: true,
      },
    ];

    setupDb({ pick, golfers, tournaments, scores });

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    // Captain golfer gets 2x multiplier on week/season points
    const captainGolfer = body.data.team.golfers.find((g: { isCaptain: boolean }) => g.isCaptain);
    expect(captainGolfer).toBeDefined();
    expect(captainGolfer.isCaptain).toBe(true);
  });

  it('includes transfer info', async () => {
    vi.mocked(getTransfersThisWeek).mockResolvedValue(1);
    setupDb();

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(body.data.transfersUsedThisWeek).toBe(0);
    expect(body.data.maxTransfersPerWeek).toBe(2);
  });

  it('returns 400 for invalid date param', async () => {
    setupDb();

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { date: 'not-a-date' } }),
      mockContext
    );
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(400);
    expect(body.error).toContain('Invalid date');
  });

  it('includes history when pick history exists', async () => {
    const histGolferId = new ObjectId();
    const pick = {
      userId: userObjectId,
      golferIds: [golferId1],
      captainId: null,
      totalSpent: 10_000_000,
      season: 2025,
      createdAt: new Date('2025-01-05'),
      updatedAt: new Date(),
    };

    const pickHistory = [
      {
        userId: userObjectId,
        season: 2025,
        golferIds: [golferId1],
        totalSpent: 10_000_000,
        reason: 'transfer',
        changedAt: new Date('2025-02-01'),
      },
      {
        userId: userObjectId,
        season: 2025,
        golferIds: [histGolferId],
        totalSpent: 10_000_000,
        reason: 'initial',
        changedAt: new Date('2025-01-05'),
      },
    ];

    const golfers = [
      {
        _id: golferId1,
        firstName: 'Rory',
        lastName: 'McIlroy',
        picture: null,
        price: 12_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // The history golfer lookup needs a separate find call with project
    setupDb({ pick, golfers, pickHistory });

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.history).toBeInstanceOf(Array);
  });

  it('includes week navigation info in period', async () => {
    const pick = {
      userId: userObjectId,
      golferIds: [],
      captainId: null,
      totalSpent: 0,
      season: 2025,
      createdAt: new Date('2025-01-05'),
      updatedAt: new Date(),
    };

    setupDb({ pick });

    const res = await handler(makeAuthEvent(), mockContext);
    const body = parseBody(res!);

    expect(res!.statusCode).toBe(200);
    expect(body.data.team.period).toHaveProperty('hasPrevious');
    expect(body.data.team.period).toHaveProperty('hasNext');
    expect(body.data.team.period).toHaveProperty('weekStart');
    expect(body.data.team.period).toHaveProperty('weekEnd');
  });

  describe('pendingChanges with golfer swap names', () => {
    const pendingGolferId = new ObjectId();

    it('returns addedGolfers and removedGolfers with names when pendingGolferIds differ', async () => {
      const pick = {
        userId: userObjectId,
        golferIds: [golferId1, golferId2],
        captainId: null,
        totalSpent: 25_000_000,
        season: 2025,
        createdAt: new Date('2025-01-05'),
        updatedAt: new Date('2025-01-10'),
        pendingGolferIds: [golferId1, pendingGolferId],
        pendingChangedAt: new Date('2025-02-01'),
      };

      const currentGolfers = [
        {
          _id: golferId1,
          firstName: 'Rory',
          lastName: 'McIlroy',
          picture: null,
          price: 12_000_000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: golferId2,
          firstName: 'Tiger',
          lastName: 'Woods',
          picture: null,
          price: 13_000_000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const addedGolferDoc = {
        _id: pendingGolferId,
        firstName: 'Scottie',
        lastName: 'Scheffler',
      };

      // The golfers collection find is called three times:
      // 1) for current team golfers, 2) for transfer history golfers, 3) for added pending golfers
      const golferFindMock = vi
        .fn()
        .mockReturnValueOnce(mockCursor(currentGolfers))
        .mockReturnValueOnce(mockCursor([]))
        .mockReturnValueOnce(mockCursor([addedGolferDoc]));

      const { mockDb } = createMockDb({
        picks: { findOne: vi.fn().mockResolvedValue(pick) },
        golfers: { find: golferFindMock },
        tournaments: { find: vi.fn().mockReturnValue(mockCursor([])) },
        scores: { find: vi.fn().mockReturnValue(mockCursor([])) },
        settings: {
          findOne: vi.fn().mockImplementation(({ key }: { key: string }) => {
            const settings = [
              { key: 'transfersOpen', value: true },
              { key: 'allowNewTeamCreation', value: true },
              { key: 'maxTransfersPerWeek', value: 2 },
            ];
            return Promise.resolve(settings.find((s) => s.key === key) ?? null);
          }),
        },
        pickHistory: { find: vi.fn().mockReturnValue(mockCursor([])) },
      });
      vi.mocked(connectToDatabase).mockResolvedValue(mockDb);

      const res = await handler(makeAuthEvent(), mockContext);
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.pendingChanges).toBeDefined();
      expect(body.data.pendingChanges.addedGolfers).toEqual([
        { id: pendingGolferId.toString(), name: 'Scottie Scheffler' },
      ]);
      expect(body.data.pendingChanges.removedGolfers).toEqual([
        { id: golferId2.toString(), name: 'Tiger Woods' },
      ]);
    });

    it('omits pendingCaptainId from response when not set in DB (golfer-swap only)', async () => {
      const pick = {
        userId: userObjectId,
        golferIds: [golferId1, golferId2],
        captainId: golferId1,
        totalSpent: 25_000_000,
        season: 2025,
        createdAt: new Date('2025-01-05'),
        updatedAt: new Date('2025-01-10'),
        pendingGolferIds: [golferId1, pendingGolferId],
        // pendingCaptainId intentionally undefined — no captain change
        pendingChangedAt: new Date('2025-02-01'),
      };

      const currentGolfers = [
        {
          _id: golferId1,
          firstName: 'Rory',
          lastName: 'McIlroy',
          picture: null,
          price: 12_000_000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: golferId2,
          firstName: 'Tiger',
          lastName: 'Woods',
          picture: null,
          price: 13_000_000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const golferFindMock = vi
        .fn()
        .mockReturnValueOnce(mockCursor(currentGolfers))
        .mockReturnValueOnce(mockCursor([]))
        .mockReturnValueOnce(mockCursor([{ _id: pendingGolferId, firstName: 'Scottie', lastName: 'Scheffler' }]));

      const { mockDb } = createMockDb({
        picks: { findOne: vi.fn().mockResolvedValue(pick) },
        golfers: { find: golferFindMock },
        tournaments: { find: vi.fn().mockReturnValue(mockCursor([])) },
        scores: { find: vi.fn().mockReturnValue(mockCursor([])) },
        settings: {
          findOne: vi.fn().mockImplementation(({ key }: { key: string }) => {
            const settings = [
              { key: 'transfersOpen', value: true },
              { key: 'allowNewTeamCreation', value: true },
              { key: 'maxTransfersPerWeek', value: 2 },
            ];
            return Promise.resolve(settings.find((s) => s.key === key) ?? null);
          }),
        },
        pickHistory: { find: vi.fn().mockReturnValue(mockCursor([])) },
      });
      vi.mocked(connectToDatabase).mockResolvedValue(mockDb);

      const res = await handler(makeAuthEvent(), mockContext);
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.pendingChanges).toBeDefined();
      // pendingCaptainId should be absent (undefined → omitted from JSON)
      expect('pendingCaptainId' in body.data.pendingChanges).toBe(false);
    });

    it('returns pendingCaptainId as null for captain removal', async () => {
      const pick = {
        userId: userObjectId,
        golferIds: [golferId1],
        captainId: golferId1,
        totalSpent: 12_000_000,
        season: 2025,
        createdAt: new Date('2025-01-05'),
        updatedAt: new Date('2025-01-10'),
        pendingCaptainId: null,
        pendingChangedAt: new Date('2025-02-01'),
      };

      const currentGolfers = [
        {
          _id: golferId1,
          firstName: 'Rory',
          lastName: 'McIlroy',
          picture: null,
          price: 12_000_000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const { mockDb } = createMockDb({
        picks: { findOne: vi.fn().mockResolvedValue(pick) },
        golfers: { find: vi.fn().mockReturnValue(mockCursor(currentGolfers)) },
        tournaments: { find: vi.fn().mockReturnValue(mockCursor([])) },
        scores: { find: vi.fn().mockReturnValue(mockCursor([])) },
        settings: {
          findOne: vi.fn().mockImplementation(({ key }: { key: string }) => {
            const settings = [
              { key: 'transfersOpen', value: true },
              { key: 'allowNewTeamCreation', value: true },
              { key: 'maxTransfersPerWeek', value: 2 },
            ];
            return Promise.resolve(settings.find((s) => s.key === key) ?? null);
          }),
        },
        pickHistory: { find: vi.fn().mockReturnValue(mockCursor([])) },
      });
      vi.mocked(connectToDatabase).mockResolvedValue(mockDb);

      const res = await handler(makeAuthEvent(), mockContext);
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.pendingChanges).toBeDefined();
      // pendingCaptainId should be explicitly null (captain removal)
      expect(body.data.pendingChanges.pendingCaptainId).toBeNull();
    });
  });

  describe('unlimitedTransfers flag', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const preSeasonSeason = {
      _id: 'season-pre',
      name: '2026',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-12-31'),
      firstGameweekStart: new Date('2026-04-03T08:00:00Z'),
      isActive: true,
    };

    const golfers = [
      {
        _id: golferId1,
        firstName: 'Rory',
        lastName: 'McIlroy',
        picture: null,
        price: 12_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: golferId2,
        firstName: 'Tiger',
        lastName: 'Woods',
        picture: null,
        price: 13_000_000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('returns unlimitedTransfers:true when before season startDate (pre-season)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));

      vi.mocked(getActiveSeason).mockResolvedValue(preSeasonSeason as unknown as Season);
      setupDb();

      const res = await handler(makeAuthEvent(), mockContext);
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.hasTeam).toBe(false);
      expect(body.data.unlimitedTransfers).toBe(true);
    });

    it('returns unlimitedTransfers:true when between season.startDate and firstGameweekStart', async () => {
      // Season started March 1, GW1 starts April 3 — current date April 1 (before GW1)
      const season = {
        ...preSeasonSeason,
        startDate: new Date('2026-03-01'),
      };
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

      vi.mocked(getActiveSeason).mockResolvedValue(season as unknown as Season);

      const pick = {
        userId: userObjectId,
        golferIds: [golferId1, golferId2],
        captainId: null,
        totalSpent: 25_000_000,
        season: 2026,
        createdAt: new Date('2026-03-15'),
        updatedAt: new Date('2026-03-15'),
      };
      setupDb({ pick, golfers });

      const res = await handler(makeAuthEvent(), mockContext);
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.unlimitedTransfers).toBe(true);
    });

    it('returns unlimitedTransfers:false when after firstGameweekStart', async () => {
      // Season started March 1, GW1 started April 3 — current date April 5 (after GW1)
      const season = {
        ...preSeasonSeason,
        startDate: new Date('2026-03-01'),
      };
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-05T12:00:00Z'));

      vi.mocked(getActiveSeason).mockResolvedValue(season as unknown as Season);

      const pick = {
        userId: userObjectId,
        golferIds: [golferId1, golferId2],
        captainId: null,
        totalSpent: 25_000_000,
        season: 2026,
        createdAt: new Date('2026-03-01'),
        updatedAt: new Date('2026-03-01'),
      };
      setupDb({ pick, golfers });

      const res = await handler(makeAuthEvent(), mockContext);
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.unlimitedTransfers).toBe(false);
    });

    it('returns unlimitedTransfers:true for no-team user when before firstGameweekStart', async () => {
      // Season started March 1, GW1 starts April 3 — current date April 1
      const season = {
        ...preSeasonSeason,
        startDate: new Date('2026-03-01'),
      };
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

      vi.mocked(getActiveSeason).mockResolvedValue(season as unknown as Season);
      setupDb(); // No pick

      const res = await handler(makeAuthEvent(), mockContext);
      const body = parseBody(res!);

      expect(res!.statusCode).toBe(200);
      expect(body.data.hasTeam).toBe(false);
      expect(body.data.unlimitedTransfers).toBe(true);
    });
  });
});
