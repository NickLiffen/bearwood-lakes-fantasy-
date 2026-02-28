import { handler } from './seasons-update';
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

const mockUpdateSeason = vi.fn();
vi.mock('./_shared/services/seasons.service', () => ({
  updateSeason: (...args: any[]) => mockUpdateSeason(...args),
}));

describe('seasons-update handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a season on PUT', async () => {
    const updated = { _id: 's1', name: '2026 Updated', isActive: true };
    mockUpdateSeason.mockResolvedValue(updated);

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      queryStringParameters: { id: 's1' },
      body: JSON.stringify({ name: '2026 Updated' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(updated);
  });

  it('returns 400 when id is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'PUT',
      queryStringParameters: {},
      body: JSON.stringify({ name: 'test' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(400);
    const body = parseBody(res);
    expect(body.error).toBe('Season id is required');
  });
});
