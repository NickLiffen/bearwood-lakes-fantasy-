import { handler } from './tournament-parse-pdf';
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

vi.mock('./_shared/services/pdf-parser.service', () => ({
  parsePdfBuffer: vi.fn(),
}));

import { parsePdfBuffer } from './_shared/services/pdf-parser.service';

describe('tournament-parse-pdf', () => {
  const mockParsePdfBuffer = vi.mocked(parsePdfBuffer);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 405 for non-POST requests', async () => {
    const event = makeAuthEvent({ httpMethod: 'GET' });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(405);
  });

  it('returns 422 when pdf field is missing', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({}),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(422);
    const body = parseBody(response);
    expect(body.error).toContain('Required');
  });

  it('returns 422 when pdf field is empty', async () => {
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ pdf: '' }),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(422);
  });

  it('returns 400 for invalid PDF magic bytes', async () => {
    // base64 of "NOT A PDF FILE"
    const notPdf = Buffer.from('NOT A PDF FILE').toString('base64');
    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ pdf: notPdf }),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(400);
    const body = parseBody(response);
    expect(body.error).toContain('Invalid PDF');
  });

  it('returns 422 when no golfers found', async () => {
    // base64 of valid PDF magic bytes
    const fakePdf = Buffer.from('%PDF-1.4 fake content').toString('base64');
    mockParsePdfBuffer.mockResolvedValue({
      name: 'Test',
      date: '2026-04-03',
      scoringFormat: 'stableford',
      golfers: [],
    });

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ pdf: fakePdf }),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(422);
    const body = parseBody(response);
    expect(body.error).toContain('No golfer data');
  });

  it('returns 200 with parsed tournament data on success', async () => {
    const fakePdf = Buffer.from('%PDF-1.4 fake content').toString('base64');
    const mockResult = {
      name: 'Friday Roll Up',
      date: '2026-04-03',
      scoringFormat: 'stableford' as const,
      golfers: [
        { position: 1, firstName: 'Ashley', lastName: 'Brinsford', rawScore: 46 },
        { position: 2, firstName: 'David', lastName: 'Husk', rawScore: 42 },
      ],
    };
    mockParsePdfBuffer.mockResolvedValue(mockResult);

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ pdf: fakePdf }),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(200);
    const body = parseBody(response);
    expect(body.data.name).toBe('Friday Roll Up');
    expect(body.data.golfers).toHaveLength(2);
    expect(body.data.golfers[0].firstName).toBe('Ashley');
  });

  it('returns 400 when parsePdfBuffer throws', async () => {
    const fakePdf = Buffer.from('%PDF-1.4 fake content').toString('base64');
    mockParsePdfBuffer.mockRejectedValue(new Error('Corrupt PDF'));

    const event = makeAuthEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ pdf: fakePdf }),
    });
    const response = await handler(event, mockContext);

    expect(response.statusCode).toBe(400);
    const body = parseBody(response);
    expect(body.error).toContain('Corrupt PDF');
  });
});
