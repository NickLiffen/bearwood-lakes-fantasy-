import { handler } from './golfers-delete';
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
vi.mock('./_shared/services/scores.service');

import { deleteGolfer } from './_shared/services/golfers.service';
import { deleteScoresForGolfer } from './_shared/services/scores.service';
import { verifyToken } from './_shared/auth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockReturnValue({
    userId: 'user-admin-1', username: 'testadmin', role: 'admin', phoneVerified: true,
  });
});

describe('golfers-delete handler', () => {
  it('deletes golfer and associated scores', async () => {
    vi.mocked(deleteScoresForGolfer).mockResolvedValue(3);
    vi.mocked(deleteGolfer).mockResolvedValue(true);

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ id: 'g1' }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain('Golfer deleted successfully');
    expect(body.message).toContain('3 scores also removed');
    expect(deleteScoresForGolfer).toHaveBeenCalledWith('g1');
    expect(deleteGolfer).toHaveBeenCalledWith('g1');
  });

  it('deletes golfer with no associated scores', async () => {
    vi.mocked(deleteScoresForGolfer).mockResolvedValue(0);
    vi.mocked(deleteGolfer).mockResolvedValue(true);

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ id: 'g1' }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(200);
    expect(body.message).toBe('Golfer deleted successfully');
  });

  it('returns 400 when id is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({}),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Golfer ID is required');
  });

  it('returns 404 when golfer not found', async () => {
    vi.mocked(deleteScoresForGolfer).mockResolvedValue(0);
    vi.mocked(deleteGolfer).mockResolvedValue(false);

    const event = makeAuthEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify({ id: 'nonexistent' }),
    });
    const result = await handler(event, mockContext);
    const body = parseBody(result);

    expect(result.statusCode).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Golfer not found');
  });

  it('returns 405 for non-DELETE method', async () => {
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
      httpMethod: 'DELETE',
      body: JSON.stringify({ id: 'g1' }),
    });
    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(403);
  });
});
