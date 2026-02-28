import { makeEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: {
    auth: { windowMs: 60000, maxRequests: 10 },
    default: { windowMs: 60000, maxRequests: 100 },
  },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn().mockReturnValue({ statusCode: 429, body: '{}' }),
}));

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

vi.mock('./_shared/services/auth.service', () => ({
  loginUser: vi.fn(),
}));

vi.mock('./_shared/validators/auth.validator', () => ({
  validateBody: vi.fn(),
  loginSchema: {},
}));

vi.mock('./_shared/utils/cookies', () => ({
  setRefreshTokenCookie: vi.fn().mockReturnValue('refresh_token=abc; HttpOnly'),
  getClientInfo: vi.fn().mockReturnValue({ userAgent: 'test-agent', ipAddress: '127.0.0.1' }),
}));

import { handler } from './auth-login';
import { loginUser } from './_shared/services/auth.service';
import { validateBody } from './_shared/validators/auth.validator';
import { setRefreshTokenCookie } from './_shared/utils/cookies';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth-login', () => {
  const credentials = { email: 'nick@example.com', password: 'password123' };

  it('returns 200 with token and Set-Cookie on successful login', async () => {
    vi.mocked(validateBody).mockReturnValue(credentials);
    vi.mocked(loginUser).mockResolvedValue({
      user: { id: 'u1', username: 'nick' },
      token: 'access-token-123',
      refreshToken: 'refresh-token-456',
    });

    const event = makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify(credentials),
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('access-token-123');
    expect(body.data.user).toEqual({ id: 'u1', username: 'nick' });
    expect(body.data.refreshToken).toBeUndefined();
    expect(result.headers!['Set-Cookie']).toBe('refresh_token=abc; HttpOnly');
    expect(setRefreshTokenCookie).toHaveBeenCalledWith('refresh-token-456');
  });

  it('returns 405 for non-POST methods', async () => {
    const event = makeEvent({ httpMethod: 'GET' });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(405);
    expect(parseBody(result).error).toBe('Method not allowed');
  });

  it('returns 401 when validation throws', async () => {
    vi.mocked(validateBody).mockImplementation(() => {
      throw new Error('Invalid email format');
    });

    const event = makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'bad' }),
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(401);
    expect(parseBody(result).error).toBe('Invalid email format');
  });

  it('returns 401 when loginUser rejects', async () => {
    vi.mocked(validateBody).mockReturnValue(credentials);
    vi.mocked(loginUser).mockRejectedValue(new Error('Invalid email or password'));

    const event = makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify(credentials),
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(401);
    expect(parseBody(result).success).toBe(false);
    expect(parseBody(result).error).toBe('Invalid email or password');
  });
});
