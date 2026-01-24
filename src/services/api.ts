// API client - typed fetch wrapper for Netlify Functions

import type {
  ApiResponse,
  User,
  AuthResponse,
  Player,
  Pick,
  LeaderboardEntry,
  TransferWindowStatus,
} from '@shared/types';

const API_BASE = '/.netlify/functions';

async function request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  // Implementation placeholder
  // - Add auth header if token exists
  // - Handle errors
  // - Parse JSON response
  const response = await fetch(`${API_BASE}/${endpoint}`, options);
  return response.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<AuthResponse>('auth-login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (data: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    password: string;
  }) =>
    request<AuthResponse>('auth-register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Users
  getUsers: () => request<User[]>('users-list'),

  // Players
  getPlayers: () => request<Player[]>('players-list'),
  createPlayer: (data: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<Player>('players-create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Picks
  getMyPicks: () => request<Pick>('picks-get'),
  savePicks: (playerIds: string[]) =>
    request<Pick>('picks-save', {
      method: 'POST',
      body: JSON.stringify({ playerIds }),
    }),

  // Scores & Leaderboard
  getLeaderboard: (week?: number) =>
    request<LeaderboardEntry[]>(`leaderboard${week ? `?week=${week}` : ''}`),

  // Admin
  enterScores: (playerId: string, week: number, points: number) =>
    request<void>('scores-enter', {
      method: 'POST',
      body: JSON.stringify({ playerId, week, points }),
    }),
  lockTransfers: () => request<TransferWindowStatus>('admin-lock-transfers', { method: 'POST' }),
};
