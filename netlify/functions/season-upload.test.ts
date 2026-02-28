import { handler } from './season-upload';
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

const mockProcessSeasonUpload = vi.fn();
vi.mock('./_shared/services/season-upload.service', () => ({
  processSeasonUpload: (...args: any[]) => mockProcessSeasonUpload(...args),
}));

vi.mock('./_shared/validators/season-upload.validator', () => ({
  seasonUploadSchema: {
    parse: vi.fn().mockImplementation((data: any) => data),
  },
}));

describe('season-upload handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes upload on POST', async () => {
    const result = { created: 5, updated: 2 };
    mockProcessSeasonUpload.mockResolvedValue(result);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ csvText: 'name,price\nTiger,10' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(result);
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(405);
    const body = parseBody(res);
    expect(body.success).toBe(false);
  });
});
