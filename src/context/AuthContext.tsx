// Auth context - global auth state management

import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate auth state from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as User;
        setToken(storedToken);
        setUser(parsedUser);
      } catch {
        // Invalid stored data, clear it
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }

    setLoading(false);
  }, []);

  const persistAuth = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    const response = await fetch('/.netlify/functions/auth-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // For refresh token cookie
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
  }): Promise<void> => {
    const response = await fetch('/.netlify/functions/auth-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // For refresh token cookie
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Registration failed');
    }

    persistAuth(result.data.token, result.data.user);
  }, [persistAuth]);

  const logout = useCallback(() => {
    // Call logout endpoint to clear refresh token cookie
    fetch('/.netlify/functions/auth-logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // Ignore errors, clear local state anyway
    });

    clearAuth();
    clearSeasonCache();
  }, [clearAuth]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/.netlify/functions/auth-refresh', {
        method: 'POST',
        credentials: 'include', // Include refresh token cookie
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

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    refreshToken,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
