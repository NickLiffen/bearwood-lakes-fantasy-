import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  getClientInfo,
} from './cookies';

describe('setRefreshTokenCookie', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('includes token value in cookie string', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const cookie = setRefreshTokenCookie('abc123');
    expect(cookie).toContain('refresh_token=abc123');
  });

  it('includes HttpOnly flag', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const cookie = setRefreshTokenCookie('tok');
    expect(cookie).toContain('HttpOnly');
  });

  it('includes Max-Age of 30 days', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const cookie = setRefreshTokenCookie('tok');
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
  });

  it('includes SameSite=Lax', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const cookie = setRefreshTokenCookie('tok');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('includes Path=/', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const cookie = setRefreshTokenCookie('tok');
    expect(cookie).toContain('Path=/');
  });

  it('does NOT include Secure in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CONTEXT', '');
    const cookie = setRefreshTokenCookie('tok');
    expect(cookie).not.toContain('Secure');
  });

  it('includes Secure in production (NODE_ENV)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const cookie = setRefreshTokenCookie('tok');
    expect(cookie).toContain('Secure');
  });

  it('includes Secure when CONTEXT is production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CONTEXT', 'production');
    const cookie = setRefreshTokenCookie('tok');
    expect(cookie).toContain('Secure');
  });
});

describe('clearRefreshTokenCookie', () => {
  it('returns cookie with Max-Age=0', () => {
    const cookie = clearRefreshTokenCookie();
    expect(cookie).toContain('Max-Age=0');
  });

  it('sets empty value', () => {
    const cookie = clearRefreshTokenCookie();
    expect(cookie).toContain('refresh_token=;');
  });

  it('includes HttpOnly', () => {
    const cookie = clearRefreshTokenCookie();
    expect(cookie).toContain('HttpOnly');
  });

  it('includes SameSite=Lax', () => {
    const cookie = clearRefreshTokenCookie();
    expect(cookie).toContain('SameSite=Lax');
  });
});

describe('getRefreshTokenFromCookie', () => {
  it('returns null for undefined header', () => {
    expect(getRefreshTokenFromCookie(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getRefreshTokenFromCookie('')).toBeNull();
  });

  it('parses token from single cookie', () => {
    expect(getRefreshTokenFromCookie('refresh_token=mytoken')).toBe('mytoken');
  });

  it('parses token from multiple cookies', () => {
    const header = 'session=abc; refresh_token=mytoken; other=xyz';
    expect(getRefreshTokenFromCookie(header)).toBe('mytoken');
  });

  it('handles = in cookie value', () => {
    const header = 'refresh_token=base64value==';
    expect(getRefreshTokenFromCookie(header)).toBe('base64value==');
  });

  it('returns null when refresh_token cookie is absent', () => {
    expect(getRefreshTokenFromCookie('session=abc; other=xyz')).toBeNull();
  });

  it('handles whitespace around cookies', () => {
    const header = ' refresh_token=tok ; other=x ';
    expect(getRefreshTokenFromCookie(header)).toBe('tok');
  });
});

describe('getClientInfo', () => {
  it('extracts user-agent', () => {
    const info = getClientInfo({ 'user-agent': 'TestBrowser/1.0' });
    expect(info.userAgent).toBe('TestBrowser/1.0');
  });

  it('prefers x-nf-client-connection-ip for IP', () => {
    const info = getClientInfo({
      'x-nf-client-connection-ip': '1.2.3.4',
      'x-forwarded-for': '5.6.7.8',
      'x-real-ip': '9.10.11.12',
    });
    expect(info.ipAddress).toBe('1.2.3.4');
  });

  it('falls back to first x-forwarded-for IP', () => {
    const info = getClientInfo({
      'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3',
    });
    expect(info.ipAddress).toBe('10.0.0.1');
  });

  it('falls back to x-real-ip', () => {
    const info = getClientInfo({ 'x-real-ip': '192.168.1.1' });
    expect(info.ipAddress).toBe('192.168.1.1');
  });

  it('returns undefined for missing headers', () => {
    const info = getClientInfo({});
    expect(info.userAgent).toBeUndefined();
    expect(info.ipAddress).toBeUndefined();
  });
});
