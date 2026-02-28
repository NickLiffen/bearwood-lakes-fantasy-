import { handler } from './golfers-update';
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

import { updateGolfer } from './_shared/services/golfers.service';
import { verifyToken } from './_shared/auth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockReturnValue({
    userId: 'user-admin-1', username: 'testadmin', role: 'admin', phoneVerified: true,
  });
});

describe('golfers-update handler', () => {
  it('updates a golfer and returns 200', async () => {
    const updatedGolfer = {
      id: 'g1', firstName: 'Tiger', lastName: 'Woods', picture: 'pic.jpg',
      price: 6000000, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    };
    vi.mocked(updateGolfer).mockResolvedValue(updatedGolfer as any);

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ id: 'g1', price: 6000000 }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.price).toBe(6000000);
    expect(updateGolfer).toHaveBeenCalledWith('g1', { price: 6000000 });
  });

  it('returns 400 when id is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ price: 6000000 }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Golfer ID is required');
  });

  it('returns 404 when golfer not found', async () => {
    vi.mocked(updateGolfer).mockResolvedValue(null);

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ id: 'nonexistent', price: 6000000 }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Golfer not found');
  });

  it('returns 405 for non-PUT method', async () => {
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
      httpMethod: 'PUT',
      body: JSON.stringify({ id: 'g1', price: 6000000 }),
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(403);
  });

  it('returns 400 when updateGolfer throws', async () => {
    vi.mocked(updateGolfer).mockRejectedValue(new Error('Update failed'));

    const event = makeAuthEvent({
      httpMethod: 'PUT',
      body: JSON.stringify({ id: 'g1', price: -1 }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Update failed');
  });
});
