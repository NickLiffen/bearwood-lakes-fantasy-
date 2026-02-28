import { handler } from './settings-reset';
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

const mockDeleteMany = vi.fn();
const mockCollection = vi.fn().mockReturnValue({ deleteMany: mockDeleteMany });
vi.mock('./_shared/db', () => ({
  connectToDatabase: vi.fn().mockResolvedValue({
    db: { collection: (...args: any[]) => mockCollection(...args) },
    client: {},
  }),
}));

vi.mock('./_shared/models/Score', () => ({ SCORES_COLLECTION: 'scores' }));
vi.mock('./_shared/models/Pick', () => ({
  PICKS_COLLECTION: 'picks',
  PICK_HISTORY_COLLECTION: 'pickHistory',
}));

describe('settings-reset handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollection.mockReturnValue({ deleteMany: mockDeleteMany });
  });

  it('resets scores on DELETE with reset-scores action', async () => {
    mockDeleteMany.mockResolvedValue({ deletedCount: 10 });

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ action: 'reset-scores', confirm: 'CONFIRM' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('10 scores');
  });

  it('resets picks on DELETE with reset-picks action', async () => {
    mockDeleteMany.mockResolvedValue({ deletedCount: 5 });

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ action: 'reset-picks', confirm: 'CONFIRM' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('5');
  });

  it('resets all on DELETE with reset-all action', async () => {
    mockDeleteMany.mockResolvedValue({ deletedCount: 3 });

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ action: 'reset-all', confirm: 'CONFIRM' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('Reset complete');
  });

  it('returns 400 when confirm is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ action: 'reset-scores' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(400);
    const body = parseBody(res);
    expect(body.error).toContain('CONFIRM');
  });

  it('returns 400 for unknown action', async () => {
    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ action: 'reset-unknown', confirm: 'CONFIRM' }),
    });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(400);
    const body = parseBody(res);
    expect(body.error).toContain('Unknown action');
  });

  it('returns 405 for wrong method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(405);
  });
});
