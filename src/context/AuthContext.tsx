// Auth context - global auth state management

import React, { createContext, useState, ReactNode } from 'react';
import type { User } from '@shared/types';

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
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, _setUser] = useState<User | null>(null);
  const [token, _setToken] = useState<string | null>(null);
  const [loading, _setLoading] = useState(true);

  // Implementation placeholder
  // - Check localStorage for existing token on mount
  // - login(), register(), logout() methods
  // - Persist token to localStorage

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    login: async () => {},
    register: async () => {},
    logout: () => {},
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
