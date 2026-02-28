import { handler } from './golfers-create';
import { makeAuthEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/auth', () => ({
  verifyToken: vi.fn().mockReturnValue({
    userId: 'user-admin-1', username: 'testadmin', role: 'admin', phoneVerified: true,
  }),
}));
vi.mock('./_shared/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: { admin: { windowMs: 60000, maxRequests: 60 }, default: { windowMs: 60000, maxRequests: 100 }, read: { windowMs: 60000, maxRequests: 120 }, write: { windowMs: 60000, maxRequests: 30 } },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

vi.mock('./_shared/services/golfers.service');

import { createGolfer } from './_shared/services/golfers.service';
import { verifyToken } from './_shared/auth';

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply admin mock after clearAllMocks
  vi.mocked(verifyToken).mockReturnValue({
    userId: 'user-admin-1', username: 'testadmin', role: 'admin', phoneVerified: true,
  });
});

describe('golfers-create handler', () => {
  const golferData = {
    firstName: 'Tiger',
    lastName: 'Woods',
    picture: 'pic.jpg',
    price: 5000000,
  };

  it('creates a golfer and returns 201', async () => {
    const createdGolfer = { id: 'g1', ...golferData, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    vi.mocked(createGolfer).mockResolvedValue(createdGolfer as any);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify(golferData),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.firstName).toBe('Tiger');
    expect(createGolfer).toHaveBeenCalledWith(golferData);
  });

  it('returns 405 for non-POST method', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(405);
    expect(body.error).toContain('Method not allowed');
  });

  it('returns 403 for non-admin user', async () => {
    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-player-1', username: 'testplayer', role: 'player', phoneVerified: true,
    });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify(golferData),
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(403);
  });

  it('returns 400 when createGolfer throws', async () => {
    vi.mocked(createGolfer).mockRejectedValue(new Error('Validation failed'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify(golferData),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation failed');
  });
});
