import { makeEvent, mockContext, parseBody } from './__test-utils__';

vi.mock('./_shared/services/auth.service', () => ({
  revokeRefreshToken: vi.fn(),
}));

vi.mock('./_shared/middleware', () => ({
  withCors: vi.fn((response, _origin?) => response),
}));

vi.mock('./_shared/utils/cookies', () => ({
  getRefreshTokenFromCookie: vi.fn(),
  clearRefreshTokenCookie: vi.fn().mockReturnValue('refresh_token=; HttpOnly; Max-Age=0; Path=/'),
}));

import { handler } from './auth-logout';
import { revokeRefreshToken } from './_shared/services/auth.service';
import { getRefreshTokenFromCookie, clearRefreshTokenCookie } from './_shared/utils/cookies';
import { withCors } from './_shared/middleware';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth-logout', () => {
  it('returns 200 and clears cookie on successful logout', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue('refresh-token-123');
    vi.mocked(revokeRefreshToken).mockResolvedValue(undefined);

    const event = makeEvent({
      httpMethod: 'POST',
      headers: {
        cookie: 'refresh_token=refresh-token-123',
        origin: 'http://localhost:3000',
      },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    expect(parseBody(result).success).toBe(true);
    expect(result.headers!['Set-Cookie']).toBe(
      'refresh_token=; HttpOnly; Max-Age=0; Path=/'
    );
    expect(revokeRefreshToken).toHaveBeenCalledWith('refresh-token-123');
    expect(withCors).toHaveBeenCalled();
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

  it('handles missing cookie gracefully', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue(null);

    const event = makeEvent({
      httpMethod: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    expect(parseBody(result).success).toBe(true);
    expect(revokeRefreshToken).not.toHaveBeenCalled();
    expect(clearRefreshTokenCookie).toHaveBeenCalled();
  });

  it('handles revocation error gracefully', async () => {
    vi.mocked(getRefreshTokenFromCookie).mockReturnValue('refresh-token-123');
    vi.mocked(revokeRefreshToken).mockRejectedValue(new Error('DB error'));

    const event = makeEvent({
      httpMethod: 'POST',
      headers: {
        cookie: 'refresh_token=refresh-token-123',
        origin: 'http://localhost:3000',
      },
    });

    const result = await handler(event, mockContext);

    // Should still succeed and clear cookie even on revocation error
    expect(result.statusCode).toBe(200);
    expect(parseBody(result).success).toBe(true);
    expect(clearRefreshTokenCookie).toHaveBeenCalled();
  });
});
