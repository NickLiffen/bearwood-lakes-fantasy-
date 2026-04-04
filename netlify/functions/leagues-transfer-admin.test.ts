import { handler } from './leagues-transfer-admin';
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
const mockTransferAdmin = vi.fn();
vi.mock('./_shared/services/leagues.service', () => ({
  getLeagueById: (...args: unknown[]) => mockGetLeagueById(...args),
  transferAdmin: (...args: unknown[]) => mockTransferAdmin(...args),
}));

beforeEach(() => vi.clearAllMocks());

const mockLeague = {
  _id: 'league-1',
  name: 'Test League',
  adminId: 'user-player-1',
  memberIds: ['user-player-1', 'new-admin-user'],
};

describe('leagues-transfer-admin handler', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = await handler(makeAuthEvent({ httpMethod: 'GET' }), mockContext);
    expect(res.statusCode).toBe(405);
    expect(parseBody(res).success).toBe(false);
  });

  it('transfers admin on POST', async () => {
    const updated = { ...mockLeague, adminId: 'new-admin-user' };
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockTransferAdmin.mockResolvedValue(updated);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'league-1', newAdminId: 'new-admin-user' }),
    });
    const res = await handler(event, mockContext);
    const body = parseBody(res);

    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(updated);
    expect(mockTransferAdmin).toHaveBeenCalledWith('league-1', 'new-admin-user');
  });

  it('returns 404 when league not found', async () => {
    mockGetLeagueById.mockResolvedValue(null);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'nonexistent', newAdminId: 'user-2' }),
    });
    const res = await handler(event, mockContext);
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when non-admin tries to transfer', async () => {
    mockGetLeagueById.mockResolvedValue({ ...mockLeague, adminId: 'other-admin' });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'league-1', newAdminId: 'new-admin-user' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(403);
    expect(parseBody(res).error).toBe('Only the league admin can transfer ownership');
  });

  it('returns 400 when new admin is not a member', async () => {
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockTransferAdmin.mockRejectedValue(new Error('New admin must be a current member'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'league-1', newAdminId: 'non-member' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toBe('New admin must be a current member');
  });

  it('returns 500 on unexpected error', async () => {
    mockGetLeagueById.mockResolvedValue(mockLeague);
    mockTransferAdmin.mockRejectedValue(new Error('DB down'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ leagueId: 'league-1', newAdminId: 'new-admin-user' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(500);
    expect(parseBody(res).success).toBe(false);
  });
});
