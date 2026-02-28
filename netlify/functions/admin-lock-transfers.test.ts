import { handler } from './admin-lock-transfers';
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
const mockSetTransfersOpen = vi.fn();
vi.mock('./_shared/services/settings.service', () => ({
  getAppSettings: (...args: any[]) => mockGetAppSettings(...args),
  setTransfersOpen: (...args: any[]) => mockSetTransfersOpen(...args),
}));

describe('admin-lock-transfers handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets transfers open with explicit value on POST', async () => {
    mockSetTransfersOpen.mockResolvedValue(undefined);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ open: true }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data.transfersOpen).toBe(true);
    expect(mockSetTransfersOpen).toHaveBeenCalledWith(true);
  });

  it('toggles transfers when no explicit value given', async () => {
    mockGetAppSettings.mockResolvedValue({ transfersOpen: true });
    mockSetTransfersOpen.mockResolvedValue(undefined);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.data.transfersOpen).toBe(false);
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(405);
  });
});
