import { handler } from './leagues-leave';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-player-1',
    username: 'testplayer',
    role: 'player',
    phoneVerified: true,
  }),
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
  getRedisClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  }),
  getRedisKeyPrefix: vi.fn().mockReturnValue('test:'),
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockGetLeagueById = vi.fn();
const mockLeaveLeague = vi.fn();
vi.mock('./_shared/services/leagues.service', () => ({
  getLeagueById: (...args: unknown[]) => mockGetLeagueById(...args),
  leaveLeague: (...args: unknown[]) => mockLeaveLeague(...args),
}));

beforeEach(() => vi.clearAllMocks());

const mockLeague = {
  _id: 'league-1',
  name: 'Test League',
  adminId: 'user-admin-1',
  memberIds: ['user-admin-1', 'user-player-1'],
};

describe('leagues-leave handler', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = await handler(makeAuthEvent({ httpMethod: 'GET' }), mockContext);
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).success).toBe(false);
  });

  it('leaves a league on POST', async () => {
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockLeaveLeague.mockResolvedValue(undefined);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'league-1' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(mockLeaveLeague).toHaveBeenCalledWith('user-player-1', 'league-1');
  });

  it('returns 404 when league not found', async () => {
    mockGetLeagueById.mockResolvedValue(null);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'nonexistent' }),
    });
    const res = await handler(event, mockContext);
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    mockGetLeagueById.mockResolvedValue({ ...mockLeague, memberIds: ['other-user'] });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'league-1' }),
    });
    const res = await handler(event, mockContext);
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when admin tries to leave', async () => {
    mockGetLeagueById.mockResolvedValue({
      ...mockLeague,
      adminId: 'user-player-1',
      memberIds: ['user-player-1', 'other-user'],
    });
    mockLeaveLeague.mockRejectedValue(new Error('Admin cannot leave the league'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'league-1' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toBe('Admin cannot leave the league');
  });
});
