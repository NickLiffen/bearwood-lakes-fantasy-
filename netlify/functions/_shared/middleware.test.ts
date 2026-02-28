import { verifyToken } from './auth';
import { checkRateLimit, RateLimitConfig, getRateLimitKeyFromEvent, rateLimitHeaders, rateLimitExceededResponse } from './rateLimit';
import {
  withCors,
  apiResponse,
  ErrorCodes,
  withAuth,
  withVerifiedAuth,
  withAdmin,
  withRateLimit,
  corsHeaders,
} from './middleware';
import type { HandlerEvent, HandlerContext } from '@netlify/functions';

vi.mock('./auth', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('./rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: new Date() }),
  RateLimitConfig: {
    auth: { windowMs: 60000, maxRequests: 10 },
    read: { windowMs: 60000, maxRequests: 120 },
    write: { windowMs: 60000, maxRequests: 30 },
    admin: { windowMs: 60000, maxRequests: 60 },
    verification: { windowMs: 60000, maxRequests: 5 },
    default: { windowMs: 60000, maxRequests: 100 },
  },
  getRateLimitKeyFromEvent: vi.fn().mockReturnValue('ratelimit:key'),
  rateLimitHeaders: vi.fn().mockReturnValue({
    'X-RateLimit-Limit': '100',
    'X-RateLimit-Remaining': '99',
    'X-RateLimit-Reset': '1234567890',
  }),
  rateLimitExceededResponse: vi.fn().mockReturnValue({
    statusCode: 429,
    body: JSON.stringify({ error: 'Rate limited' }),
  }),
}));

vi.mock('./utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const makeEvent = (overrides: Partial<HandlerEvent> = {}): HandlerEvent => ({
  rawUrl: 'http://localhost/.netlify/functions/test',
  rawQuery: '',
  path: '/.netlify/functions/test',
  httpMethod: 'GET',
  headers: {},
  multiValueHeaders: {},
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  body: null,
  isBase64Encoded: false,
  ...overrides,
});

const mockContext: HandlerContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: '',
  memoryLimitInMB: '128',
  awsRequestId: '',
  logGroupName: '',
  logStreamName: '',
  getRemainingTimeInMillis: () => 5000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('middleware', () => {
  describe('withCors', () => {
    it('adds CORS headers to response', () => {
      const response = { statusCode: 200, body: '{}' };
      const result = withCors(response, 'http://localhost:3000');

      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
      expect(result.headers!['Access-Control-Allow-Credentials']).toBe('true');
      expect(result.headers!['Access-Control-Allow-Methods']).toContain('GET');
    });

    it('uses wildcard when no ALLOWED_ORIGINS configured and no origin', () => {
      const response = { statusCode: 200, body: '{}' };
      const result = withCors(response);

      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('apiResponse', () => {
    it('returns success format when no error', () => {
      const response = apiResponse(200, { data: 'test' });
      const body = JSON.parse(response.body!);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ data: 'test' });
    });

    it('returns error format when error provided', () => {
      const response = apiResponse(400, null, 'Bad request');
      const body = JSON.parse(response.body!);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Bad request');
    });

    it('handles null data for success responses', () => {
      const response = apiResponse(204, null);
      const body = JSON.parse(response.body!);

      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });
  });

  describe('ErrorCodes', () => {
    it('has correct status codes', () => {
      expect(ErrorCodes.BAD_REQUEST.status).toBe(400);
      expect(ErrorCodes.UNAUTHORIZED.status).toBe(401);
      expect(ErrorCodes.FORBIDDEN.status).toBe(403);
      expect(ErrorCodes.NOT_FOUND.status).toBe(404);
      expect(ErrorCodes.METHOD_NOT_ALLOWED.status).toBe(405);
      expect(ErrorCodes.CONFLICT.status).toBe(409);
      expect(ErrorCodes.VALIDATION_ERROR.status).toBe(422);
      expect(ErrorCodes.RATE_LIMITED.status).toBe(429);
      expect(ErrorCodes.INTERNAL_ERROR.status).toBe(500);
    });
  });

  describe('withAuth', () => {
    const handler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"ok":true}' });

    it('returns 401 when no authorization header', async () => {
      const wrapped = withAuth(handler);
      const event = makeEvent({ headers: {} });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('returns 401 when token is not Bearer format', async () => {
      const wrapped = withAuth(handler);
      const event = makeEvent({ headers: { authorization: 'Basic abc123' } });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when token verification fails', async () => {
      vi.mocked(verifyToken).mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const wrapped = withAuth(handler);
      const event = makeEvent({ headers: { authorization: 'Bearer expired-token' } });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(401);
    });

    it('passes authenticated event to handler on valid token', async () => {
      vi.mocked(verifyToken).mockReturnValue({
        userId: 'u1',
        username: 'nick',
        role: 'user',
        phoneVerified: true,
      });
      const wrapped = withAuth(handler);
      const event = makeEvent({ headers: { authorization: 'Bearer valid-token' } });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ userId: 'u1' }) }),
        mockContext
      );
    });

    it('handles OPTIONS preflight', async () => {
      const wrapped = withAuth(handler);
      const event = makeEvent({ httpMethod: 'OPTIONS' });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(204);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('withVerifiedAuth', () => {
    it('returns 403 when phone is not verified', async () => {
      vi.mocked(verifyToken).mockReturnValue({
        userId: 'u1',
        username: 'nick',
        role: 'user',
        phoneVerified: false,
      });
      const handler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
      const wrapped = withVerifiedAuth(handler);
      const event = makeEvent({ headers: { authorization: 'Bearer token' } });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body!);
      expect(body.error).toContain('Phone verification required');
    });

    it('passes through when phone is verified', async () => {
      vi.mocked(verifyToken).mockReturnValue({
        userId: 'u1',
        username: 'nick',
        role: 'user',
        phoneVerified: true,
      });
      const handler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"ok":true}' });
      const wrapped = withVerifiedAuth(handler);
      const event = makeEvent({ headers: { authorization: 'Bearer token' } });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('withAdmin', () => {
    it('returns 403 for non-admin user', async () => {
      vi.mocked(verifyToken).mockReturnValue({
        userId: 'u1',
        username: 'nick',
        role: 'user',
        phoneVerified: true,
      });
      const handler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
      const wrapped = withAdmin(handler);
      const event = makeEvent({ headers: { authorization: 'Bearer token' } });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body!);
      expect(body.error).toContain('Admin access required');
    });

    it('passes through for admin user', async () => {
      vi.mocked(verifyToken).mockReturnValue({
        userId: 'u1',
        username: 'nick',
        role: 'admin',
        phoneVerified: true,
      });
      const handler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"ok":true}' });
      const wrapped = withAdmin(handler);
      const event = makeEvent({ headers: { authorization: 'Bearer token' } });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('withRateLimit', () => {
    it('handles OPTIONS preflight without rate limiting', async () => {
      const handler = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
      const wrapped = withRateLimit(handler);
      const event = makeEvent({ httpMethod: 'OPTIONS' });

      const result = await wrapped(event, mockContext);

      expect(result.statusCode).toBe(204);
      expect(checkRateLimit).not.toHaveBeenCalled();
    });

    it('returns 429 when rate limit exceeded', async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
        retryAfter: 60,
      });
      const handler = vi.fn();
      const wrapped = withRateLimit(handler);
      const event = makeEvent();

      await wrapped(event, mockContext);

      expect(rateLimitExceededResponse).toHaveBeenCalledWith(60);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('corsHeaders', () => {
    it('includes essential CORS fields', () => {
      expect(corsHeaders['Content-Type']).toBe('application/json');
      expect(corsHeaders['Access-Control-Allow-Methods']).toContain('GET');
      expect(corsHeaders['Access-Control-Allow-Methods']).toContain('POST');
    });
  });
});
