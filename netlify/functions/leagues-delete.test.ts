import { handler } from './leagues-delete';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-player-1', username: 'testplayer', role: 'player', phoneVerified: true,
  }),
}));
vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: { default: { windowMs: 60000, maxRequests: 100 }, read: { windowMs: 60000, maxRequests: 120 }, write: { windowMs: 60000, maxRequests: 30 }, admin: { windowMs: 60000, maxRequests: 60 } },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
  getRedisClient: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') }),
  getRedisKeyPrefix: vi.fn().mockReturnValue('test:'),
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockGetLeagueById = vi.fn();
const mockDeleteLeague = vi.fn();
vi.mock('./_shared/services/leagues.service', () => ({
  getLeagueById: (...args: any[]) => mockGetLeagueById(...args),
  deleteLeague: (...args: any[]) => mockDeleteLeague(...args),
}));

beforeEach(() => vi.clearAllMocks());

const mockLeague = {
  _id: 'league-1',
  name: 'Test League',
  adminId: 'user-player-1',
  memberIds: ['user-player-1'],
};

describe('leagues-delete handler', () => {
  it('returns 405 for non-DELETE/POST methods', async () => {
    const res = await handler(makeAuthEvent({ httpMethod: 'GET' }), mockContext);
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).success).toBe(false);
  });

  it('deletes a league on DELETE', async () => {
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockDeleteLeague.mockResolvedValue(undefined);

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ leagueId: 'league-1' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDeleteLeague).toHaveBeenCalledWith('league-1');
  });

  it('deletes a league on POST (fallback)', async () => {
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockDeleteLeague.mockResolvedValue(undefined);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'league-1' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when league not found', async () => {
    mockGetLeagueById.mockResolvedValue(null);

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ leagueId: 'nonexistent' }),
    });
    const res = await handler(event, mockContext);
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when non-admin tries to delete', async () => {
    mockGetLeagueById.mockResolvedValue({ ...mockLeague, adminId: 'other-user' });

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ leagueId: 'league-1' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(403);
    expect(parseBody(res).error).toBe('Only the league admin can delete the league');
  });

  it('returns 500 on service error', async () => {
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockDeleteLeague.mockRejectedValue(new Error('DB down'));

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ leagueId: 'league-1' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(500);
    expect(parseBody(res).success).toBe(false);
  });
});
