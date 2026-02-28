import { ObjectId } from 'mongodb';
import { handler } from './tournament-detail';
import { makeEvent, makeAuthEvent, mockContext, parseBody, createMockDb, mockCursor } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('./_shared/db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('./_shared/models/Tournament', () => ({
  TOURNAMENTS_COLLECTION: 'tournaments',
  toTournament: vi.fn(),
}));

vi.mock('./_shared/models/Score', () => ({
  SCORES_COLLECTION: 'scores',
}));

vi.mock('./_shared/models/Golfer', () => ({
  GOLFERS_COLLECTION: 'golfers',
}));

import { verifyToken } from './_shared/auth';
import { connectToDatabase } from './_shared/db';
import { toTournament } from './_shared/models/Tournament';

const mockVerify = vi.mocked(verifyToken);
const mockConnect = vi.mocked(connectToDatabase);
const mockToTournament = vi.mocked(toTournament);

const tid = new ObjectId();
const gid1 = new ObjectId();
const gid2 = new ObjectId();
const gid3 = new ObjectId();

function makeTournamentDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: tid,
    name: 'The Masters',
    startDate: new Date('2025-04-10'),
    endDate: new Date('2025-04-13'),
    status: 'published',
    tournamentType: 'rollup_stableford',
    scoringFormat: 'stableford',
    isMultiDay: true,
    multiplier: 2,
    golferCountTier: '20+',
    season: 2025,
    participatingGolferIds: [gid1, gid2, gid3],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const scoresDocs = [
  { _id: new ObjectId(), tournamentId: tid, golferId: gid1, position: 1, participated: true, rawScore: 68, basePoints: 50, bonusPoints: 10, multipliedPoints: 120 },
  { _id: new ObjectId(), tournamentId: tid, golferId: gid2, position: 2, participated: true, rawScore: 70, basePoints: 40, bonusPoints: 5, multipliedPoints: 90 },
  { _id: new ObjectId(), tournamentId: tid, golferId: gid3, position: null, participated: true, rawScore: 75, basePoints: 30, bonusPoints: 0, multipliedPoints: 60 },
];

const golfersDocs = [
  { _id: gid1, firstName: 'Tiger', lastName: 'Woods', picture: 'tiger.jpg' },
  { _id: gid2, firstName: 'Rory', lastName: 'McIlroy', picture: 'rory.jpg' },
  { _id: gid3, firstName: 'Jon', lastName: 'Rahm', picture: 'jon.jpg' },
];

function setupDb(tournamentDoc: any, scores = scoresDocs, golfers = golfersDocs) {
  const { mockDb } = createMockDb({
    tournaments: { findOne: vi.fn().mockResolvedValue(tournamentDoc) },
    scores: { find: vi.fn().mockReturnValue(mockCursor(scores)) },
    golfers: { find: vi.fn().mockReturnValue(mockCursor(golfers)) },
  });
  mockConnect.mockResolvedValue(mockDb);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockToTournament.mockImplementation((doc: any) => ({
    id: doc._id.toString(),
    name: doc.name,
    startDate: doc.startDate,
    endDate: doc.endDate,
    tournamentType: doc.tournamentType,
    scoringFormat: doc.scoringFormat,
    isMultiDay: doc.isMultiDay,
    multiplier: doc.multiplier,
    golferCountTier: doc.golferCountTier,
    season: doc.season,
    status: doc.status,
    participatingGolferIds: (doc.participatingGolferIds || []).map((id: any) => id.toString()),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));
});

describe('tournament-detail handler', () => {
  it('returns 204 for OPTIONS', async () => {
    const res = await handler(makeEvent({ httpMethod: 'OPTIONS' }), mockContext);
    expect(res.statusCode).toBe(204);
  });

  it('returns 405 for non-GET methods', async () => {
    const res = await handler(makeEvent({ httpMethod: 'POST' }), mockContext);
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).error).toBe('Method not allowed');
  });

  it('returns 400 when id is missing', async () => {
    const res = await handler(makeEvent({ queryStringParameters: {} }), mockContext);
    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toBe('Tournament ID is required');
  });

  it('returns 400 for invalid ObjectId', async () => {
    const res = await handler(
      makeEvent({ queryStringParameters: { id: 'not-valid' } }),
      mockContext,
    );
    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toBe('Invalid tournament ID format');
  });

  it('returns 404 when tournament not found', async () => {
    setupDb(null);
    const res = await handler(
      makeEvent({ queryStringParameters: { id: tid.toString() } }),
      mockContext,
    );
    expect(res.statusCode).toBe(404);
    expect(parseBody(res).error).toBe('Tournament not found');
  });

  it('returns 404 for draft tournament when user is not admin', async () => {
    setupDb(makeTournamentDoc({ status: 'draft' }));
    const res = await handler(
      makeEvent({ queryStringParameters: { id: tid.toString() } }),
      mockContext,
    );
    expect(res.statusCode).toBe(404);
  });

  it('admin can see draft tournament', async () => {
    mockVerify.mockReturnValue({
      userId: 'user-admin-1',
      username: 'testadmin',
      role: 'admin',
      phoneVerified: true,
    });
    setupDb(makeTournamentDoc({ status: 'draft' }));

    const res = await handler(
      makeAuthEvent({ queryStringParameters: { id: tid.toString() } }),
      mockContext,
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.data.tournament.status).toBe('draft');
  });

  it('returns tournament with podium, scores, and stats', async () => {
    setupDb(makeTournamentDoc());

    const res = await handler(
      makeEvent({ queryStringParameters: { id: tid.toString() } }),
      mockContext,
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);

    // Tournament data
    expect(body.data.tournament.name).toBe('The Masters');
    expect(body.data.tournament.participantCount).toBe(3);

    // Podium
    expect(body.data.podium.first.golfer.firstName).toBe('Tiger');
    expect(body.data.podium.second.golfer.firstName).toBe('Rory');
    expect(body.data.podium.third).toBeNull();

    // Scores sorted by position, then points
    expect(body.data.scores).toHaveLength(3);
    expect(body.data.scores[0].golfer.firstName).toBe('Tiger');
    expect(body.data.scores[1].golfer.firstName).toBe('Rory');

    // Stats
    expect(body.data.stats.totalParticipants).toBe(3);
    expect(body.data.stats.bonusScorers).toBe(2);
    expect(body.data.stats.averagePoints).toBe(90);
  });

  it('returns 500 on unexpected error', async () => {
    mockConnect.mockRejectedValue(new Error('DB down'));
    const res = await handler(
      makeEvent({ queryStringParameters: { id: tid.toString() } }),
      mockContext,
    );
    expect(res.statusCode).toBe(500);
    expect(parseBody(res).error).toBe('Failed to fetch tournament details');
  });
});
