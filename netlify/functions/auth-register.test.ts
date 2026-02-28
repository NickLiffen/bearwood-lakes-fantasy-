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
  registerUser: vi.fn(),
}));

vi.mock('./_shared/services/settings.service', () => ({
  getAppSettings: vi.fn(),
}));

vi.mock('./_shared/validators/auth.validator', () => ({
  validateBody: vi.fn(),
  registerSchema: {},
}));

vi.mock('./_shared/twilio', () => ({
  sendVerificationCode: vi.fn().mockResolvedValue('pending'),
}));

vi.mock('./_shared/utils/cookies', () => ({
  setRefreshTokenCookie: vi.fn().mockReturnValue('refresh_token=abc; HttpOnly'),
  getClientInfo: vi.fn().mockReturnValue({ userAgent: 'test-agent', ipAddress: '127.0.0.1' }),
}));

import { handler } from './auth-register';
import { registerUser } from './_shared/services/auth.service';
import { getAppSettings } from './_shared/services/settings.service';
import { validateBody } from './_shared/validators/auth.validator';
import { sendVerificationCode } from './_shared/twilio';
import { setRefreshTokenCookie } from './_shared/utils/cookies';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth-register', () => {
  const registrationData = {
    email: 'nick@example.com',
    password: 'password123',
    username: 'nick',
    phoneNumber: '+441234567890',
  };

  function setupOpenRegistration() {
    vi.mocked(getAppSettings).mockResolvedValue({
      registrationOpen: true,
      transfersOpen: false,
      allowNewTeamCreation: true,
    });
    vi.mocked(validateBody).mockReturnValue(registrationData);
    vi.mocked(registerUser).mockResolvedValue({
      user: { id: 'u1', username: 'nick' },
      token: 'access-token-123',
      refreshToken: 'refresh-token-456',
    });
  }

  it('returns 201 on successful registration', async () => {
    setupOpenRegistration();

    const event = makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify(registrationData),
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(201);
    const body = parseBody(result);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('access-token-123');
    expect(body.data.user).toEqual({ id: 'u1', username: 'nick' });
    expect(result.headers!['Set-Cookie']).toBe('refresh_token=abc; HttpOnly');
    expect(setRefreshTokenCookie).toHaveBeenCalledWith('refresh-token-456');
    expect(sendVerificationCode).toHaveBeenCalledWith('+441234567890');
  });

  it('returns 403 when registration is closed', async () => {
    vi.mocked(getAppSettings).mockResolvedValue({
      registrationOpen: false,
      transfersOpen: false,
      allowNewTeamCreation: false,
    });

    const event = makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify(registrationData),
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(403);
    expect(parseBody(result).error).toContain('Registration is currently closed');
    expect(registerUser).not.toHaveBeenCalled();
  });

  it('returns 400 when validation throws', async () => {
    vi.mocked(getAppSettings).mockResolvedValue({
      registrationOpen: true,
      transfersOpen: false,
      allowNewTeamCreation: true,
    });
    vi.mocked(validateBody).mockImplementation(() => {
      throw new Error('Username is required');
    });

    const event = makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(parseBody(result).error).toBe('Username is required');
  });

  it('returns 409 when user already exists', async () => {
    vi.mocked(getAppSettings).mockResolvedValue({
      registrationOpen: true,
      transfersOpen: false,
      allowNewTeamCreation: true,
    });
    vi.mocked(validateBody).mockReturnValue(registrationData);
    vi.mocked(registerUser).mockRejectedValue(new Error('User already exists'));

    const event = makeEvent({
      httpMethod: 'POST',
      body: JSON.stringify(registrationData),
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(409);
    expect(parseBody(result).error).toBe('User already exists');
  });

  it('returns 405 for non-POST methods', async () => {
    const event = makeEvent({ httpMethod: 'GET' });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(405);
    expect(parseBody(result).error).toBe('Method not allowed');
  });
});
