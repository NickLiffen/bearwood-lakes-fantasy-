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

  // Core refresh logic (called by timer, manual refresh, and retry)
  const doRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/.netlify/functions/auth-refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        clearAuth();
        return false;
      }

      const data = await response.json();
      persistAuth(data.data.token, data.data.user);
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }, [persistAuth, clearAuth]);

  // Schedule a proactive refresh before the access token expires
  const scheduleRefresh = useCallback((accessToken: string) => {
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
  }, [clearRefreshTimer, doRefresh]);

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

  const login = useCallback(async (username: string, password: string): Promise<void> => {
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
  }, [persistAuth]);

  const register = useCallback(async (data: {
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
  }, [persistAuth]);

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
