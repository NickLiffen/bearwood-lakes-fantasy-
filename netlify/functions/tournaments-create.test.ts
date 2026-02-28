import { handler } from './tournaments-create';
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
  createTournament: vi.fn(),
}));

import { verifyToken } from './_shared/auth';
import { createTournament } from './_shared/services/tournaments.service';

const mockVerify = vi.mocked(verifyToken);
const mockCreate = vi.mocked(createTournament);

const validBody = {
  name: 'The Open',
  startDate: '2025-07-17',
  endDate: '2025-07-20',
  tournamentType: 'rollup_stableford',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerify.mockReturnValue({
    userId: 'user-admin-1',
    username: 'testadmin',
    role: 'admin',
    phoneVerified: true,
  });
});

describe('tournaments-create handler', () => {
  it('creates a tournament successfully', async () => {
    mockCreate.mockResolvedValue({ id: 't1', ...validBody } as any);

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'POST',
        body: JSON.stringify(validBody),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(201);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Tournament created successfully');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'The Open' }),
    );
  });

  it('returns 405 for non-POST methods', async () => {
    const res = await handler(
      makeAuthEvent({ httpMethod: 'GET' }),
      mockContext,
    );
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await handler(
      makeAuthEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ name: 'Incomplete' }),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(400);
    expect(parseBody(res).error).toContain('required');
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
        httpMethod: 'POST',
        body: JSON.stringify(validBody),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(403);
    expect(parseBody(res).error).toContain('Admin');
  });

  it('returns 500 on service error', async () => {
    mockCreate.mockRejectedValue(new Error('DB error'));

    const res = await handler(
      makeAuthEvent({
        httpMethod: 'POST',
        body: JSON.stringify(validBody),
      }),
      mockContext,
    );
    expect(res.statusCode).toBe(500);
    expect(parseBody(res).error).toBe('Failed to create tournament');
  });
});
