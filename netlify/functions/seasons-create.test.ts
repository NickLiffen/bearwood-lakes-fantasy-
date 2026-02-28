import { handler } from './seasons-create';
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

const mockCreateSeason = vi.fn();
vi.mock('./_shared/services/seasons.service', () => ({
  createSeason: (...args: any[]) => mockCreateSeason(...args),
}));

describe('seasons-create handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a season on POST', async () => {
    const newSeason = { _id: 's1', name: '2026', startDate: '2026-04-01', endDate: '2027-03-30' };
    mockCreateSeason.mockResolvedValue(newSeason);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ name: '2026', startDate: '2026-04-01', endDate: '2027-03-30' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(201);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(newSeason);
    expect(mockCreateSeason).toHaveBeenCalledWith({
      name: '2026',
      startDate: '2026-04-01',
      endDate: '2027-03-30',
      isActive: undefined,
      status: undefined,
    });
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(405);
    const body = parseBody(res);
    expect(body.success).toBe(false);
  });
});
