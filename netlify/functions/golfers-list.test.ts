import { handler } from './golfers-list';
import { makeAuthEvent, mockContext, parseBody, createMockDb, mockAggregateCursor, mockCursor } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-admin-1', username: 'testadmin', role: 'admin', phoneVerified: true,
  }),
}));
vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: { admin: { windowMs: 60000, maxRequests: 60 }, default: { windowMs: 60000, maxRequests: 100 }, read: { windowMs: 60000, maxRequests: 120 }, write: { windowMs: 60000, maxRequests: 30 } },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

vi.mock('./_shared/db');
vi.mock('./_shared/utils/dates', () => ({
  getSeasonStart: vi.fn().mockReturnValue(new Date('2026-01-01T00:00:00Z')),
}));
vi.mock('./_shared/utils/perf', () => ({
  createPerfTimer: vi.fn().mockReturnValue({
    measure: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
    end: vi.fn(),
  }),
}));
vi.mock('./_shared/utils/response', async () => {
  const actual = await vi.importActual<typeof import('./_shared/utils/response')>('./_shared/utils/response');
  return actual;
});

import { connectToDatabase } from './_shared/db';
import { ObjectId } from 'mongodb';

beforeEach(() => {
  vi.clearAllMocks();
});

const makeGolferDoc = (id: string, firstName: string, lastName: string) => ({
  _id: new ObjectId(id),
  firstName,
  lastName,
  picture: 'pic.jpg',
  price: 5000000,
  isActive: true,
  stats2024: { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0, timesScored32Plus: 0 },
  stats2025: { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0, timesScored32Plus: 0 },
  stats2026: { timesPlayed: 0, timesFinished1st: 0, timesFinished2nd: 0, timesFinished3rd: 0, timesScored36Plus: 0, timesScored32Plus: 0 },
  createdAt: new Date(),
  updatedAt: new Date(),
  scores: [],
});

const makeSeasonDoc = (name: string, isActive: boolean) => ({
  _id: new ObjectId(),
  name,
  startDate: `${name}-01-01`,
  endDate: `${name}-12-31`,
  isActive,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('golfers-list handler', () => {
  function setupMockDb(golfers: any[], tournaments: any[] = [], seasons: any[] = [], picks: any[] = []) {
    const golfersCollection = {
      aggregate: vi.fn().mockReturnValue(mockAggregateCursor(golfers)),
      countDocuments: vi.fn().mockResolvedValue(golfers.length),
    };
    const tournamentsCollection = {
      find: vi.fn().mockReturnValue(mockCursor(tournaments)),
    };
    const seasonsCollection = {
      find: vi.fn().mockReturnValue(mockCursor(seasons)),
    };
    const picksCollection = {
      find: vi.fn().mockReturnValue(mockCursor(picks)),
    };

    const { mockDb } = createMockDb({
      golfers: golfersCollection,
      tournaments: tournamentsCollection,
      seasons: seasonsCollection,
      picks: picksCollection,
    });

    vi.mocked(connectToDatabase).mockResolvedValue(mockDb);
    return { golfersCollection, tournamentsCollection, seasonsCollection, picksCollection };
  }

  it('returns empty list when no golfers', async () => {
    setupMockDb([], [], [makeSeasonDoc('2026', true)]);

    const event = makeAuthEvent({ httpMethod: 'GET' });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns golfers with stats, form, and ownership', async () => {
    const golferId = '507f1f77bcf86cd799439011';
    const tournamentId = new ObjectId();
    const seasons = [makeSeasonDoc('2026', true)];
    const golfer = {
      ...makeGolferDoc(golferId, 'Tiger', 'Woods'),
      scores: [
        {
          tournamentId,
          position: 1,
          multipliedPoints: 50,
          bonusPoints: 10,
          rawScore: 40,
        },
      ],
    };

    const tournament = {
      _id: tournamentId,
      startDate: '2026-06-01',
      status: 'published',
      season: 2026,
    };

    setupMockDb([golfer], [tournament], seasons);

    const event = makeAuthEvent({ httpMethod: 'GET' });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].firstName).toBe('Tiger');
    expect(body.data[0].points).toBeDefined();
    expect(body.data[0].stats2026).toBeDefined();
    expect(body.data[0].seasonStats).toBeDefined();
    expect(typeof body.data[0].selectedPercentage).toBe('number');
  });

  it('handles pagination params', async () => {
    const golferId = '507f1f77bcf86cd799439011';
    const golfer = makeGolferDoc(golferId, 'Rory', 'McIlroy');
    const seasons = [makeSeasonDoc('2026', true)];

    const mocks = setupMockDb([golfer], [], seasons);
    mocks.golfersCollection.countDocuments.mockResolvedValue(5);

    const event = makeAuthEvent({
      httpMethod: 'GET',
      queryStringParameters: { page: '1', limit: '2' },
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.total).toBe(5);
  });

  it('handles season query parameter', async () => {
    const golferId = '507f1f77bcf86cd799439011';
    const golfer = makeGolferDoc(golferId, 'Brooks', 'Koepka');
    const seasons = [makeSeasonDoc('2025', false), makeSeasonDoc('2026', true)];

    setupMockDb([golfer], [], seasons);

    const event = makeAuthEvent({
      httpMethod: 'GET',
      queryStringParameters: { season: '2025' },
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 500 on internal error', async () => {
    vi.mocked(connectToDatabase).mockRejectedValue(new Error('DB connection failed'));

    const event = makeAuthEvent({ httpMethod: 'GET' });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('DB connection failed');
  });
});
