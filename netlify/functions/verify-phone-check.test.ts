import { handler } from './verify-phone-check';
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

const mockCheckPhoneVerification = vi.fn();
vi.mock('./_shared/services/verification.service', () => ({
  checkPhoneVerification: (...args: any[]) => mockCheckPhoneVerification(...args),
}));

vi.mock('./_shared/validators/auth.validator', () => ({
  validateBody: vi.fn().mockImplementation((_schema: any, body: any) => JSON.parse(body || '{}')),
  verifyPhoneSchema: {},
}));

vi.mock('./_shared/utils/cookies', () => ({
  setRefreshTokenCookie: vi.fn().mockReturnValue('refreshToken=abc; HttpOnly'),
  getClientInfo: vi.fn().mockReturnValue({ userAgent: 'test-agent', ipAddress: '127.0.0.1' }),
}));

describe('verify-phone-check handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies phone code on POST', async () => {
    mockCheckPhoneVerification.mockResolvedValue({
      user: { id: 'user-admin-1', username: 'testadmin' },
      token: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ code: '123456' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('new-access-token');
    expect(res.headers?.['Set-Cookie']).toBe('refreshToken=abc; HttpOnly');
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(405);
    const body = parseBody(res);
    expect(body.success).toBe(false);
  });
});
