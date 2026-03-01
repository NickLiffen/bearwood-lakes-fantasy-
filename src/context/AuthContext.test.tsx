import React, { useContext } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthContext, AuthProvider } from './AuthContext';

// Mock clearSeasonCache — imported by AuthContext
vi.mock('../hooks/useActiveSeason', () => ({
  clearSeasonCache: vi.fn(),
}));

// Helper: create a valid JWT with a given exp timestamp (seconds)
function makeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: '1', exp }));
  return `${header}.${payload}.signature`;
}

const mockUser = {
  id: 'u1',
  firstName: 'Nick',
  lastName: 'Liffen',
  username: 'nickliffen',
  email: 'nick@example.com',
  phoneNumber: '07912345678',
  phoneVerified: false,
  role: 'user' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Token that expires in 1 hour
const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('Missing AuthProvider');
  return ctx;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('AuthContext — login', () => {
  it('stores token and user on successful login', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { token: validToken, user: mockUser } }),
    });

    const { result } = renderHook(useAuthContext, { wrapper });

    // Wait for loading to finish
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login('nickliffen', 'password123');
    });

    expect(result.current.token).toBe(validToken);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem('token')).toBe(validToken);
    expect(localStorage.getItem('user')).toBe(JSON.stringify(mockUser));
  });

  it('throws error on failed login', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    });

    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => {
        await result.current.login('bad', 'creds');
      })
    ).rejects.toThrow('Invalid credentials');

    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('AuthContext — register', () => {
  it('stores token and user on successful register', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { token: validToken, user: mockUser } }),
    });

    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const regData = {
      firstName: 'Nick',
      lastName: 'Liffen',
      username: 'nickliffen',
      email: 'nick@example.com',
      password: 'securepassword',
      phoneNumber: '07912345678',
    };

    await act(async () => {
      await result.current.register(regData);
    });

    expect(result.current.token).toBe(validToken);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);

    // Verify fetch was called with correct body including phoneNumber
    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('auth-register');
    const requestInit = fetchCall[1];
    expect(requestInit.credentials).toBe('include');
    expect(JSON.parse(requestInit.body)).toEqual(regData);
  });
});

describe('AuthContext — logout', () => {
  it('clears user, token, and localStorage', async () => {
    // Pre-seed localStorage so hydration picks it up
    localStorage.setItem('token', validToken);
    localStorage.setItem('user', JSON.stringify(mockUser));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('AuthContext — initial hydration', () => {
  it('hydrates user and token from localStorage when token is valid', async () => {
    localStorage.setItem('token', validToken);
    localStorage.setItem('user', JSON.stringify(mockUser));

    // fetch may be called for scheduled refresh — provide a stub
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: validToken, user: mockUser } }),
    });

    const { result } = renderHook(useAuthContext, { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.token).toBe(validToken);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('attempts refresh when stored token is expired', async () => {
    const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 100);
    localStorage.setItem('token', expiredToken);
    localStorage.setItem('user', JSON.stringify(mockUser));

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { token: validToken, user: mockUser } }),
    });

    const { result } = renderHook(useAuthContext, { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // After refresh succeeds, the new valid token should be set
    expect(result.current.token).toBe(validToken);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('clears auth when no stored data exists', async () => {
    global.fetch = vi.fn();

    const { result } = renderHook(useAuthContext, { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('AuthContext — isAuthenticated', () => {
  it('is true when both user and token present', async () => {
    localStorage.setItem('token', validToken);
    localStorage.setItem('user', JSON.stringify(mockUser));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: validToken, user: mockUser } }),
    });

    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(true);
  });

  it('is false when no user or token', async () => {
    global.fetch = vi.fn();

    const { result } = renderHook(useAuthContext, { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
  });
});
