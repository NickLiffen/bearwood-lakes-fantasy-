import { handler } from './admin-apply-transfers';
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

const mockApplyAll = vi.fn();
vi.mock('./_shared/services/picks.service', () => ({
  applyAllPendingChanges: (...args: unknown[]) => mockApplyAll(...args),
}));

describe('admin-apply-transfers handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 405 for non-POST method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);
    expect(res.statusCode).toBe(405);
  });

  it('applies pending transfers and returns results', async () => {
    const pendingDate = new Date('2026-04-10T07:00:00Z');
    mockApplyAll.mockResolvedValue({
      applied: 2,
      total: 2,
      details: [
        { userId: 'user-1', pendingChangedAt: pendingDate },
        { userId: 'user-2', pendingChangedAt: pendingDate },
      ],
    });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data.applied).toBe(2);
    expect(body.data.details).toHaveLength(2);
  });

  it('returns success with zero applied when nothing pending', async () => {
    mockApplyAll.mockResolvedValue({ applied: 0, total: 0, details: [] });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.data.applied).toBe(0);
    expect(body.data.message).toContain('No pending transfers');
  });

  it('returns 500 on error', async () => {
    mockApplyAll.mockRejectedValue(new Error('DB error'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(500);
    const body = parseBody(res);
    expect(body.success).toBe(false);
  });
});
