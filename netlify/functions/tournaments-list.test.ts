import { ObjectId } from 'mongodb';
import { handler } from './tournaments-list';
import { makeEvent, makeAuthEvent, mockContext, parseBody, createMockDb, mockCursor } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('./_shared/db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('./_shared/services/tournaments.service', () => ({
  getAllTournaments: vi.fn(),
  getTournamentsByStatus: vi.fn(),
}));

vi.mock('./_shared/services/seasons.service', () => ({
  getActiveSeason: vi.fn(),
  getSeasonByName: vi.fn(),
}));

import { verifyToken } from './_shared/auth';
import { connectToDatabase } from './_shared/db';
import { getAllTournaments, getTournamentsByStatus } from './_shared/services/tournaments.service';
import { getActiveSeason, getSeasonByName } from './_shared/services/seasons.service';

const mockVerify = vi.mocked(verifyToken);
const mockConnect = vi.mocked(connectToDatabase);
const mockGetAll = vi.mocked(getAllTournaments);
const mockGetByStatus = vi.mocked(getTournamentsByStatus);
const mockGetActiveSeason = vi.mocked(getActiveSeason);
const mockGetSeasonByName = vi.mocked(getSeasonByName);

const seasonDates = {
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31'),
};

function makeTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: new ObjectId().toString(),
    name: 'Test Open',
    startDate: new Date('2025-06-01'),
    endDate: new Date('2025-06-04'),
    status: 'published',
    tournamentType: 'rollup_stableford',
    scoringFormat: 'stableford',
    isMultiDay: false,
    multiplier: 1,
    golferCountTier: '20+',
    season: 2025,
    participatingGolferIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: active season exists
  mockGetActiveSeason.mockResolvedValue({
    id: 'season-1',
    name: '2025',
    ...seasonDates,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
});

describe('tournaments-list handler', () => {
  it('returns 204 for OPTIONS', async () => {
    const res = await handler(makeEvent({ httpMethod: 'OPTIONS' }), mockContext);
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for non-GET methods', async () => {
    const res = await handler(makeEvent({ httpMethod: 'POST' }), mockContext);
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).error).toBe('Method not allowed');
  });

  it('non-admin sees only published and complete tournaments', async () => {
    const published = [makeTournament({ status: 'published' })];
    const complete = [makeTournament({ status: 'complete' })];
    mockGetByStatus.mockImplementation(async (status: string) =>
      status === 'published' ? published : complete
    );

    const res = await handler(makeEvent(), mockContext);
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it('admin sees all tournaments including drafts', async () => {
    mockVerify.mockReturnValue({
      userId: 'user-admin-1',
      username: 'testadmin',
      role: 'admin',
      phoneVerified: true,
    });

    const allTournaments = [
      makeTournament({ status: 'draft' }),
      makeTournament({ status: 'published' }),
      makeTournament({ status: 'complete' }),
    ];
    mockGetAll.mockResolvedValue(allTournaments as any);

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { allSeasons: 'true' } }),
      mockContext,
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.data).toHaveLength(3);
    expect(mockGetAll).toHaveBeenCalled();
  });

  it('filters tournaments by active season for non-admin', async () => {
    const inSeason = makeTournament({ startDate: new Date('2025-06-01') });
    const outOfSeason = makeTournament({ startDate: new Date('2024-06-01') });
    mockGetByStatus
      .mockResolvedValueOnce([inSeason, outOfSeason] as any)
      .mockResolvedValueOnce([] as any);

    const res = await handler(makeEvent(), mockContext);
    const body = parseBody(res);
    expect(body.data).toHaveLength(1);
  });

  it('filters by named season parameter', async () => {
    mockGetByStatus.mockResolvedValue([makeTournament()] as any);
    mockGetSeasonByName.mockResolvedValue({
      id: 's1',
      name: '2025',
      ...seasonDates,
      isActive: true,
    } as any);

    const res = await handler(
      makeEvent({ queryStringParameters: { season: '2025' } }),
      mockContext,
    );
    expect(res.statusCode).toBe(200);
    expect(mockGetSeasonByName).toHaveBeenCalledWith('2025');
  });

  it('returns empty array when no matching season found', async () => {
    mockGetByStatus.mockResolvedValue([makeTournament()] as any);
    mockGetActiveSeason.mockResolvedValue(null as any);

    const res = await handler(makeEvent(), mockContext);
    const body = parseBody(res);
    expect(body.data).toHaveLength(0);
  });

  it('enriches with podium data when includeResults=true', async () => {
    const tid = new ObjectId();
    const gid1 = new ObjectId();
    const gid2 = new ObjectId();

    const tournament = makeTournament({ id: tid.toString(), status: 'published' });
    mockGetByStatus.mockResolvedValue([tournament] as any);

    const scores = [
      { tournamentId: tid, golferId: gid1, position: 1, participated: true, bonusPoints: 5, multipliedPoints: 100 },
      { tournamentId: tid, golferId: gid2, position: 2, participated: true, bonusPoints: 0, multipliedPoints: 80 },
    ];
    const golfers = [
      { _id: gid1, firstName: 'Tiger', lastName: 'Woods' },
      { _id: gid2, firstName: 'Rory', lastName: 'McIlroy' },
    ];

    const { mockDb } = createMockDb({
      scores: { find: vi.fn().mockReturnValue(mockCursor(scores)) },
      golfers: { find: vi.fn().mockReturnValue(mockCursor(golfers)) },
    });
    mockConnect.mockResolvedValue(mockDb);

    const res = await handler(
      makeEvent({ queryStringParameters: { includeResults: 'true' } }),
      mockContext,
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.data[0].results).toBeDefined();
    expect(body.data[0].results.first.firstName).toBe('Tiger');
    expect(body.data[0].results.second.firstName).toBe('Rory');
    expect(body.data[0].results.bonusScorerCount).toBe(1);
    expect(body.data[0].results.participantCount).toBe(2);
  });

  it('returns 500 on unexpected error', async () => {
    mockGetByStatus.mockRejectedValue(new Error('DB down'));

    const res = await handler(makeEvent(), mockContext);
    expect(res.statusCode).toBe(500);
    expect(parseBody(res).error).toBe('Failed to fetch tournaments');
  });
});
