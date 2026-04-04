// Auth context - global auth state management

import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { User } from '@shared/types';
import { clearSeasonCache } from '../hooks/useActiveSeason';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    password: string;
    phoneNumber: string;
  }) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

// Decode JWT payload without a library (base64url → JSON)
function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

// How many ms before expiry to proactively refresh (60 seconds)
const REFRESH_BUFFER_MS = 60 * 1000;

// Retry configuration for refresh failures
const MAX_REFRESH_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

// Error codes from the backend that mean the session is definitively over
const DEFINITIVE_ERROR_CODES = new Set([
  'NO_REFRESH_TOKEN',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'USER_NOT_FOUND',
]);

// Error codes that are worth retrying
const RETRYABLE_ERROR_CODES = new Set(['ROTATION_RACE']);

/**
 * Acquire a cross-tab lock for token refresh.
 * Uses navigator.locks when available, falls back to localStorage-based lease.
 */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request('auth-token-refresh', fn);
  }
  return withLocalStorageLock(fn);
}

const LOCK_KEY = 'auth_refresh_lock';
const LOCK_LEASE_MS = 5000;

async function withLocalStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Wait for any existing lock to expire
  for (let i = 0; i < 50; i++) {
    const existing = localStorage.getItem(LOCK_KEY);
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        if (Date.now() - parsed.ts < LOCK_LEASE_MS) {
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
      } catch {
        // Corrupted lock value — treat as expired
        localStorage.removeItem(LOCK_KEY);
      }
    }
    break;
  }

  localStorage.setItem(LOCK_KEY, JSON.stringify({ id: lockId, ts: Date.now() }));

  // Verify we own the lock (another tab might have written at the same time)
  await new Promise((r) => setTimeout(r, 10));
  const check = localStorage.getItem(LOCK_KEY);
  if (check) {
    try {
      const parsed = JSON.parse(check);
      if (parsed.id !== lockId) {
        // Lost the lock race — wait briefly and read the new token from storage
        await new Promise((r) => setTimeout(r, LOCK_LEASE_MS));
        throw new LockLostError();
      }
    } catch (e) {
      if (e instanceof LockLostError) throw e;
      // Corrupted — remove and proceed as if we have the lock
      localStorage.removeItem(LOCK_KEY);
    }
  }

  try {
    return await fn();
  } finally {
    const current = localStorage.getItem(LOCK_KEY);
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (parsed.id === lockId) {
          localStorage.removeItem(LOCK_KEY);
        }
      } catch {
        // Corrupted lock — clean it up
        localStorage.removeItem(LOCK_KEY);
      }
    }
  }
}

class LockLostError extends Error {
  constructor() {
    super('Lock lost to another tab');
    this.name = 'LockLostError';
  }
}

/** Sleep helper for retry backoff */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const persistAuth = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const clearAuth = useCallback(() => {
    clearRefreshTimer();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, [clearRefreshTimer]);

  // Core refresh logic with retry and cross-tab coordination
  const doRefresh = useCallback(async (): Promise<boolean> => {
    try {
      return await withRefreshLock(async () => {
        // After acquiring the lock, check if another tab already refreshed
        const freshToken = localStorage.getItem(TOKEN_KEY);
        if (freshToken) {
          const exp = decodeJwtExp(freshToken);
          if (exp && exp * 1000 - Date.now() > REFRESH_BUFFER_MS) {
            // Token was already refreshed by another tab — use it
            const storedUser = localStorage.getItem(USER_KEY);
            if (storedUser) {
              try {
                setToken(freshToken);
                setUser(JSON.parse(storedUser) as User);
                return true;
              } catch {
                // Fall through to refresh
              }
            }
          }
        }

        // Perform the actual refresh with retry logic
        let lastError: string | undefined;
        let lastCode: string | undefined;

        for (let attempt = 0; attempt <= MAX_REFRESH_RETRIES; attempt++) {
          if (attempt > 0) {
            await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
          }

          try {
            const response = await fetch('/.netlify/functions/auth-refresh', {
              method: 'POST',
              credentials: 'include',
            });

            if (response.ok) {
              const data = await response.json();
              persistAuth(data.data.token, data.data.user);
              return true;
            }

            // Parse error response for typed error codes
            let errorBody: { error?: string; code?: string } = {};
            try {
              errorBody = await response.json();
            } catch {
              // Non-JSON response — treat as transient
            }

            lastError = errorBody.error;
            lastCode = errorBody.code;

            // Definitive failure — don't retry
            if (lastCode && DEFINITIVE_ERROR_CODES.has(lastCode)) {
              clearAuth();
              return false;
            }

            // Retryable error code — continue loop
            if (lastCode && RETRYABLE_ERROR_CODES.has(lastCode)) {
              continue;
            }

            // Server error (5xx) — retryable
            if (response.status >= 500) {
              continue;
            }

            // Unknown 4xx — don't retry
            clearAuth();
            return false;
          } catch {
            // Network error — retryable
            lastError = 'Network error';
            continue;
          }
        }

        // All retries exhausted
        console.warn('[Auth] Token refresh failed after retries:', lastError, lastCode);
        clearAuth();
        return false;
      });
    } catch (error) {
      if (error instanceof LockLostError) {
        // Another tab got the lock — check if it refreshed successfully
        const freshToken = localStorage.getItem(TOKEN_KEY);
        const storedUser = localStorage.getItem(USER_KEY);
        if (freshToken && storedUser) {
          try {
            setToken(freshToken);
            setUser(JSON.parse(storedUser) as User);
            return true;
          } catch {
            // Fall through
          }
        }
        return false;
      }
      throw error;
    }
  }, [persistAuth, clearAuth]);

  // Schedule a proactive refresh before the access token expires
  const scheduleRefresh = useCallback(
    (accessToken: string) => {
      clearRefreshTimer();
      const exp = decodeJwtExp(accessToken);
      if (!exp) return;

      const expiresAt = exp * 1000; // Convert to ms
      const now = Date.now();
      const delay = expiresAt - now - REFRESH_BUFFER_MS;

      if (delay <= 0) {
        // Already expired or about to — refresh immediately
        doRefresh();
        return;
      }

      refreshTimerRef.current = setTimeout(() => {
        doRefresh();
      }, delay);
    },
    [clearRefreshTimer, doRefresh]
  );

  // Hydrate auth state from localStorage on mount — validate token expiry
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as User;
        const exp = decodeJwtExp(storedToken);
        const now = Date.now() / 1000;

        if (exp && exp > now) {
          // Token is still valid — use it and schedule proactive refresh
          setToken(storedToken);
          setUser(parsedUser);
          scheduleRefresh(storedToken);
          setLoading(false);
        } else {
          // Token expired — attempt a silent refresh using the httpOnly cookie
          setLoading(true);
          doRefresh().finally(() => setLoading(false));
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Schedule refresh whenever the token changes
  useEffect(() => {
    if (token) {
      scheduleRefresh(token);
    }
  }, [token, scheduleRefresh]);

  // Multi-tab sync: listen for storage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) {
        if (e.newValue) {
          // Another tab refreshed the token — sync state
          setToken(e.newValue);
          const storedUser = localStorage.getItem(USER_KEY);
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser) as User);
            } catch {
              // Ignore parse errors
            }
          }
        } else {
          // Another tab logged out — sync
          setToken(null);
          setUser(null);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Refresh token when tab regains focus (handles browser timer throttling)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const currentToken = localStorage.getItem(TOKEN_KEY);
      if (!currentToken) return;

      const exp = decodeJwtExp(currentToken);
      if (!exp) return;

      const now = Date.now();
      const expiresAt = exp * 1000;

      if (expiresAt <= now || expiresAt - now <= REFRESH_BUFFER_MS) {
        // Token is expired or about to expire — refresh immediately
        doRefresh();
      } else {
        // Token is still valid — reschedule the timer (it may have been throttled)
        scheduleRefresh(currentToken);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [doRefresh, scheduleRefresh]);

  const login = useCallback(
    async (username: string, password: string): Promise<void> => {
      const response = await fetch('/.netlify/functions/auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      persistAuth(data.data.token, data.data.user);
    },
    [persistAuth]
  );

  const register = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      username: string;
      email: string;
      password: string;
      phoneNumber: string;
    }): Promise<void> => {
      const response = await fetch('/.netlify/functions/auth-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Registration failed');
      }

      persistAuth(result.data.token, result.data.user);
    },
    [persistAuth]
  );

  const logout = useCallback(() => {
    fetch('/.netlify/functions/auth-logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // Ignore errors, clear local state anyway
    });

    clearAuth();
    clearSeasonCache();
  }, [clearAuth]);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    refreshToken: doRefresh,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
