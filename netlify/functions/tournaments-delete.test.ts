import { handler } from './tournaments-delete';
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

vi.mock('./_shared/services/tournaments.service', () => ({
  deleteTournament: vi.fn(),
}));

vi.mock('./_shared/services/scores.service', () => ({
  getScoresForTournament: vi.fn(),
}));

import { verifyToken } from './_shared/auth';
import { deleteTournament } from './_shared/services/tournaments.service';
import { getScoresForTournament } from './_shared/services/scores.service';

const mockVerify = vi.mocked(verifyToken);
const mockDelete = vi.mocked(deleteTournament);
const mockGetScores = vi.mocked(getScoresForTournament);

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockReturnValue({
    userId: 'user-admin-1',
    username: 'testadmin',
    role: 'admin',
    phoneVerified: true,
  });
  mockGetScores.mockResolvedValue([]);
});

describe('tournaments-delete handler', () => {
  it('deletes a tournament successfully', async () => {
    mockDelete.mockResolvedValue(true as any);

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'DELETE',
        body: JSON.stringify({ id: 't1' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Tournament deleted successfully');
    expect(mockDelete).toHaveBeenCalledWith('t1');
  });

  it('returns 400 when tournament has participated scores', async () => {
    mockGetScores.mockResolvedValue([
      { id: 's1', participated: true },
      { id: 's2', participated: true },
    ] as any);

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'DELETE',
        body: JSON.stringify({ id: 't1' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(400);
    const body = parseBody(res);
    expect(body.error).toContain('Cannot delete tournament');
    expect(body.error).toContain('2 score(s)');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('allows deletion when scores exist but none participated', async () => {
    mockGetScores.mockResolvedValue([
      { id: 's1', participated: false },
    ] as any);
    mockDelete.mockResolvedValue(true as any);

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'DELETE',
        body: JSON.stringify({ id: 't1' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith('t1');
  });

  it('returns 400 when id is missing', async () => {
    const res = await handler(
      makeAuthEvent({
        httpMethod: 'DELETE',
        body: JSON.stringify({}),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toContain('id is required');
  });

  it('returns 404 when tournament not found', async () => {
    mockDelete.mockResolvedValue(false as any);

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'DELETE',
        body: JSON.stringify({ id: 'nonexistent' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(404);
    expect(parseBody(res).error).toBe('Tournament not found');
  });

  it('returns 405 for non-DELETE methods', async () => {
    const res = await handler(
      makeAuthEvent({ httpMethod: 'GET' }),
      mockContext,
    );
    expect(res.statusCode).toBe(405);
  });

  it('returns 403 for non-admin user', async () => {
    mockVerify.mockReturnValue({
      userId: 'user-player-1',
      username: 'player',
      role: 'player',
      phoneVerified: true,
    });

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'DELETE',
        body: JSON.stringify({ id: 't1' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    mockDelete.mockRejectedValue(new Error('DB error'));

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'DELETE',
        body: JSON.stringify({ id: 't1' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(500);
  });
});
