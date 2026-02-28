import { handler } from './seasons-delete';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-admin-1',
    username: 'testadmin',
    role: 'admin',
    phoneVerified: true,
  }),
}));

vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: {
    admin: { windowMs: 60000, maxRequests: 60 },
    default: { windowMs: 60000, maxRequests: 100 },
    read: { windowMs: 60000, maxRequests: 120 },
    write: { windowMs: 60000, maxRequests: 30 },
    auth: { windowMs: 60000, maxRequests: 10 },
    verification: { windowMs: 60000, maxRequests: 5 },
  },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
}));

vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockDeleteSeason = vi.fn();
vi.mock('./_shared/services/seasons.service', () => ({
  deleteSeason: (...args: any[]) => mockDeleteSeason(...args),
}));

describe('seasons-delete handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a season on DELETE', async () => {
    mockDeleteSeason.mockResolvedValue(true);

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      queryStringParameters: { id: 's1' },
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(mockDeleteSeason).toHaveBeenCalledWith('s1');
  });

  it('returns 400 when id is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      queryStringParameters: {},
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(400);
    const body = parseBody(res);
    expect(body.error).toBe('Season id is required');
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(405);
  });
});
