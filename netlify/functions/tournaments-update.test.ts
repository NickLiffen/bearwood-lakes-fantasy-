import { handler } from './tournaments-update';
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
  updateTournament: vi.fn(),
}));

vi.mock('./_shared/services/scores.service', () => ({
  recalculateScoresForTournament: vi.fn(),
}));

import { verifyToken } from './_shared/auth';
import { updateTournament } from './_shared/services/tournaments.service';
import { recalculateScoresForTournament } from './_shared/services/scores.service';

const mockVerify = vi.mocked(verifyToken);
const mockUpdate = vi.mocked(updateTournament);
const mockRecalc = vi.mocked(recalculateScoresForTournament);

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockReturnValue({
    userId: 'user-admin-1',
    username: 'testadmin',
    role: 'admin',
    phoneVerified: true,
  });
});

describe('tournaments-update handler', () => {
  it('updates a tournament successfully', async () => {
    const updated = { id: 't1', name: 'Updated Open', status: 'published' };
    mockUpdate.mockResolvedValue(updated as any);

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ id: 't1', name: 'Updated Open' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Tournament updated successfully');
    expect(body.data.name).toBe('Updated Open');
  });

  it('recalculates scores when tournamentType changes', async () => {
    mockUpdate.mockResolvedValue({ id: 't1' } as any);

    await handler(
      makeAuthEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ id: 't1', tournamentType: 'medal_individual' }),
      }),
      mockContext,
    );
    expect(mockRecalc).toHaveBeenCalledWith('t1');
  });

  it('recalculates scores when scoringFormat changes', async () => {
    mockUpdate.mockResolvedValue({ id: 't1' } as any);

    await handler(
      makeAuthEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ id: 't1', scoringFormat: 'medal' }),
      }),
      mockContext,
    );
    expect(mockRecalc).toHaveBeenCalledWith('t1');
  });

  it('does not recalculate when only name changes', async () => {
    mockUpdate.mockResolvedValue({ id: 't1' } as any);

    await handler(
      makeAuthEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ id: 't1', name: 'New Name' }),
      }),
      mockContext,
    );
    expect(mockRecalc).not.toHaveBeenCalled();
  });

  it('returns 400 when id is missing', async () => {
    const res = await handler(
      makeAuthEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ name: 'No ID' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toContain('id is required');
  });

  it('returns 404 when tournament not found', async () => {
    mockUpdate.mockResolvedValue(null as any);

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ id: 'nonexistent' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(404);
    expect(parseBody(res).error).toBe('Tournament not found');
  });

  it('returns 405 for non-PUT methods', async () => {
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
        httpMethod: 'PUT',
        body: JSON.stringify({ id: 't1', name: 'Nope' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    mockUpdate.mockRejectedValue(new Error('DB error'));

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ id: 't1', name: 'Boom' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(500);
    expect(parseBody(res).error).toBe('Failed to update tournament');
  });
});
