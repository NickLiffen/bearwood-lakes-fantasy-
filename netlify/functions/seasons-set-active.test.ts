import { handler } from './seasons-set-active';
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

const mockSetActiveSeason = vi.fn();
vi.mock('./_shared/services/seasons.service', () => ({
  setActiveSeason: (...args: any[]) => mockSetActiveSeason(...args),
}));

describe('seasons-set-active handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets active season on POST', async () => {
    const season = { _id: 's1', name: '2026', isActive: true };
    mockSetActiveSeason.mockResolvedValue(season);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ id: 's1' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(season);
    expect(mockSetActiveSeason).toHaveBeenCalledWith('s1');
  });

  it('returns 400 when id is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(400);
    const body = parseBody(res);
    expect(body.error).toBe('Season id is required');
  });
});
