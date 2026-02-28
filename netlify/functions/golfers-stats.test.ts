import { handler } from './golfers-stats';
import { makeEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/services/scores.service');
vi.mock('./_shared/services/tournaments.service');

import { getScoresForGolfer } from './_shared/services/scores.service';
import { getAllTournaments } from './_shared/services/tournaments.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('golfers-stats handler', () => {
  it('returns 400 when golferId is missing', async () => {
    const event = makeEvent({ httpMethod: 'GET', queryStringParameters: {} });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.error).toContain('golferId is required');
  });

  it('returns 405 for non-GET method', async () => {
    const event = makeEvent({ httpMethod: 'POST' });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(405);
    expect(body.error).toContain('Method not allowed');
  });

  it('returns calculated stats for a golfer', async () => {
    vi.mocked(getAllTournaments).mockResolvedValue([
      {
        id: 't1', name: 'The Open', startDate: '2026-06-15', endDate: '2026-06-18',
        status: 'published', season: 2026, courseName: 'St Andrews',
        multiplier: 1, bonusThreshold: 36, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 't2', name: 'Draft', startDate: '2026-07-01', endDate: '2026-07-04',
        status: 'draft', season: 2026, courseName: 'Augusta',
        multiplier: 1, bonusThreshold: 36, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);

    vi.mocked(getScoresForGolfer).mockResolvedValue([
      {
        id: 's1', golferId: 'g1', tournamentId: 't1', position: 1,
        multipliedPoints: 50, bonusPoints: 10, rawScore: 40, participated: true,
        score: 40, points: 40, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 's2', golferId: 'g1', tournamentId: 't2', position: 2,
        multipliedPoints: 30, bonusPoints: 5, rawScore: 35, participated: true,
        score: 35, points: 35, createdAt: new Date(), updatedAt: new Date(),
      },
    ]);

    const event = makeEvent({
      httpMethod: 'GET',
      queryStringParameters: { golferId: 'g1' },
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    // Only t1 is published; t2 is draft so s2 is excluded
    expect(body.data.tournamentsPlayed).toBe(1);
    expect(body.data.totalPoints).toBe(50);
    expect(body.data.firstPlaceFinishes).toBe(1);
    expect(body.data.secondPlaceFinishes).toBe(0);
    expect(body.data.timesBonusScored).toBe(1);
  });

  it('returns zero stats when golfer has no scores', async () => {
    vi.mocked(getAllTournaments).mockResolvedValue([]);
    vi.mocked(getScoresForGolfer).mockResolvedValue([]);

    const event = makeEvent({
      httpMethod: 'GET',
      queryStringParameters: { golferId: 'g1' },
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.data.tournamentsPlayed).toBe(0);
    expect(body.data.totalPoints).toBe(0);
  });

  it('returns 500 on internal error', async () => {
    vi.mocked(getScoresForGolfer).mockRejectedValue(new Error('DB error'));

    const event = makeEvent({
      httpMethod: 'GET',
      queryStringParameters: { golferId: 'g1' },
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(500);
    expect(body.error).toContain('Failed to fetch golfer stats');
  });
});
