import { makeEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/services/auth.service', () => ({
  refreshAccessToken: vi.fn(),
  RefreshError: class RefreshError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'RefreshError';
      this.code = code;
    }
  },
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
import { refreshAccessToken, RefreshError } from './_shared/services/auth.service';
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

  it('returns 401 with code and clears cookie on definitive failure', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue('expired-token');
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new RefreshError('Refresh token expired', 'TOKEN_EXPIRED')
    );

    const event = makeEvent({
      httpMethod: 'POST',
      headers: {
        cookie: 'refresh_token=expired-token',
        origin: 'http://localhost:3000',
      },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(401);
    const body = parseBody(result);
    expect(body.error).toBe('Refresh token expired');
    expect(body.code).toBe('TOKEN_EXPIRED');
    expect(result.headers!['Set-Cookie']).toBe(
      'refresh_token=; HttpOnly; Max-Age=0; Path=/'
    );
    expect(clearRefreshTokenCookie).toHaveBeenCalled();
  });

  it('returns 401 with NO_REFRESH_TOKEN code when cookie missing', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue(null);

    const event = makeEvent({
      httpMethod: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(401);
    const body = parseBody(result);
    expect(body.code).toBe('NO_REFRESH_TOKEN');
    expect(result.headers!['Set-Cookie']).toBe(
      'refresh_token=; HttpOnly; Max-Age=0; Path=/'
    );
  });

  it('returns 409 without clearing cookie on ROTATION_RACE', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue('raced-token');
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new RefreshError('Token was just rotated', 'ROTATION_RACE')
    );

    const event = makeEvent({
      httpMethod: 'POST',
      headers: {
        cookie: 'refresh_token=raced-token',
        origin: 'http://localhost:3000',
      },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(409);
    const body = parseBody(result);
    expect(body.code).toBe('ROTATION_RACE');
    // Must NOT clear the cookie — the winning tab already set the new one
    expect(clearRefreshTokenCookie).not.toHaveBeenCalled();
    expect(result.headers!['Set-Cookie']).toBeUndefined();
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
