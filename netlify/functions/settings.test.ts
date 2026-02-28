import { handler } from './settings';
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

const mockGetAppSettings = vi.fn();
const mockSetSetting = vi.fn();
vi.mock('./_shared/services/settings.service', () => ({
  getAppSettings: (...args: any[]) => mockGetAppSettings(...args),
  setSetting: (...args: any[]) => mockSetSetting(...args),
}));

describe('settings handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns settings on GET', async () => {
    const settings = { transfersOpen: false, registrationOpen: true };
    mockGetAppSettings.mockResolvedValue(settings);

    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(settings);
  });

  it('updates a setting on PUT', async () => {
    const updatedSettings = { transfersOpen: true, registrationOpen: true };
    mockSetSetting.mockResolvedValue(undefined);
    mockGetAppSettings.mockResolvedValue(updatedSettings);

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ key: 'transfersOpen', value: true }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(updatedSettings);
    expect(mockSetSetting).toHaveBeenCalledWith('transfersOpen', true);
  });
});
