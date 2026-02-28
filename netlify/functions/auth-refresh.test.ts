import { makeEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/services/auth.service', () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock('./_shared/middleware', () => ({
  withCors: vi.fn((response, _origin?) => response),
}));

vi.mock('./_shared/utils/cookies', () => ({
  getRefreshTokenFromCookie: vi.fn(),
  setRefreshTokenCookie: vi.fn().mockReturnValue('refresh_token=new-token; HttpOnly'),
  clearRefreshTokenCookie: vi.fn().mockReturnValue('refresh_token=; HttpOnly; Max-Age=0; Path=/'),
  getClientInfo: vi.fn().mockReturnValue({ userAgent: 'test-agent', ipAddress: '127.0.0.1' }),
}));

import { handler } from './auth-refresh';
import { refreshAccessToken } from './_shared/services/auth.service';
import {
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from './_shared/utils/cookies';
import { withCors } from './_shared/middleware';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth-refresh', () => {
  it('returns 200 with new tokens on successful refresh', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue('old-refresh-token');
    vi.mocked(refreshAccessToken).mockResolvedValue({
      user: { id: 'u1', username: 'nick' },
      token: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const event = makeEvent({
      httpMethod: 'POST',
      headers: {
        cookie: 'refresh_token=old-refresh-token',
        origin: 'http://localhost:3000',
        'user-agent': 'test-agent',
      },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = parseBody(result);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe('new-access-token');
    expect(body.data.user).toEqual({ id: 'u1', username: 'nick' });
    expect(result.headers!['Set-Cookie']).toBe('refresh_token=new-token; HttpOnly');
    expect(setRefreshTokenCookie).toHaveBeenCalledWith('new-refresh-token');
    expect(refreshAccessToken).toHaveBeenCalledWith(
      'old-refresh-token',
      'test-agent',
      '127.0.0.1'
    );
    expect(withCors).toHaveBeenCalled();
  });

  it('returns 401 when no refresh token cookie', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue(null);

    const event = makeEvent({
      httpMethod: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(401);
    expect(parseBody(result).error).toBe('No refresh token provided');
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('returns 401 and clears cookie on expired/invalid token', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue('expired-token');
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('Token expired or revoked'));

    const event = makeEvent({
      httpMethod: 'POST',
      headers: {
        cookie: 'refresh_token=expired-token',
        origin: 'http://localhost:3000',
      },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(401);
    expect(parseBody(result).error).toBe('Token expired or revoked');
    expect(result.headers!['Set-Cookie']).toBe(
      'refresh_token=; HttpOnly; Max-Age=0; Path=/'
    );
    expect(clearRefreshTokenCookie).toHaveBeenCalled();
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const event = makeEvent({
      httpMethod: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(204);
    expect(withCors).toHaveBeenCalled();
  });

  it('returns 405 for non-POST/OPTIONS methods', async () => {
    const event = makeEvent({
      httpMethod: 'GET',
      headers: { origin: 'http://localhost:3000' },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(405);
    expect(parseBody(result).error).toBe('Method not allowed');
  });
});
