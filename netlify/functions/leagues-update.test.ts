import { handler } from './leagues-update';
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
const mockUpdateLeague = vi.fn();
vi.mock('./_shared/services/leagues.service', () => ({
  getLeagueById: (...args: unknown[]) => mockGetLeagueById(...args),
  updateLeague: (...args: unknown[]) => mockUpdateLeague(...args),
}));

beforeEach(() => vi.clearAllMocks());

const mockLeague = {
  _id: 'league-1',
  name: 'Test League',
  adminId: 'user-player-1',
  memberIds: ['user-player-1'],
};

describe('leagues-update handler', () => {
  it('returns 405 for non-PUT methods', async () => {
    const res = await handler(makeAuthEvent({ httpMethod: 'POST' }), mockContext);
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).success).toBe(false);
  });

  it('updates a league on PUT', async () => {
    const updated = { ...mockLeague, name: 'Updated League' };
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockUpdateLeague.mockResolvedValue(updated);

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ id: 'league-1', name: 'Updated League', description: 'New desc' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(updated);
    expect(mockUpdateLeague).toHaveBeenCalledWith('league-1', {
      name: 'Updated League',
      description: 'New desc',
    });
  });

  it('returns 404 when league not found', async () => {
    mockGetLeagueById.mockResolvedValue(null);

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ id: 'nonexistent', name: 'X' }),
    });
    const res = await handler(event, mockContext);
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when non-admin tries to update', async () => {
    mockGetLeagueById.mockResolvedValue({ ...mockLeague, adminId: 'other-user' });

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ id: 'league-1', name: 'Nope' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(403);
    expect(parseBody(res).error).toBe('Only the league admin can update settings');
  });

  it('returns 500 on service error', async () => {
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockUpdateLeague.mockRejectedValue(new Error('DB down'));

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ id: 'league-1', name: 'Fail' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(500);
    expect(parseBody(res).success).toBe(false);
  });
});
