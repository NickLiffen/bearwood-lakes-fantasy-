import { handler } from './tournament-parse-csv';
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
  },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
}));

vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

describe('tournament-parse-csv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 405 for non-POST requests', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(405);
  });

  it('returns 422 when csv field is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(422);
    const body = parseBody(response);
    expect(body.error).toContain('Required');
  });

  it('returns 422 when csv field is empty', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ csv: '' }),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(422);
  });

  it('returns 422 when no golfers found', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ csv: 'Position,Player,Stableford Points' }),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(422);
    const body = parseBody(response);
    expect(body.error).toContain('No golfer data found');
    expect(body.error).toContain('Stableford Points');
  });

  it('returns 200 with parsed tournament data on success', async () => {
    const csv = `Position,Player,Stableford Points
1,John Pulley,41
2,Alex Hoque,40
3,Paul Eggleton,38`;

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ csv }),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(200);
    const body = parseBody(response);
    expect(body.data.scoringFormat).toBe('stableford');
    expect(body.data.golfers).toHaveLength(3);
    expect(body.data.golfers[0].firstName).toBe('John');
    expect(body.data.golfers[0].lastName).toBe('Pulley');
    expect(body.data.golfers[0].rawScore).toBe(41);
    expect(body.data.golfers[0].position).toBe(1);
  });

  it('returns 400 when body is invalid JSON', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: 'not json',
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(400);
  });
});
