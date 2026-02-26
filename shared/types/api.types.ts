// API request/response types

import type { Golfer, GolferSeasonStats } from './golfer.types';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TransferWindowStatus {
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: string;
}

// ============================================
// Navigation & Period Types
// ============================================

export interface PeriodInfo {
  weekStart?: string;
  weekEnd?: string;
  monthStart?: string;
  monthEnd?: string;
  type?: 'week' | 'month' | 'season';
  startDate?: string;
  endDate?: string;
  label: string;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface WeekOption {
  value?: string;
  date?: string;
  label: string;
}

export interface MonthOption {
  value: string;
  label: string;
}

// ============================================
// Golfer Display Types (for API responses)
// ============================================

// Simplified golfer stats for display (alias for GolferSeasonStats)
export type GolferStats = GolferSeasonStats;

// Points summary for a golfer
export interface GolferPoints {
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
}

// Tournament score for display (includes tournament name)
export interface TournamentScore {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  position: number | null;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
  rawScore: number | null;
  participated: boolean;
}

// Golfer with calculated scores (used in My Team, User Profile)
export interface GolferWithScores {
  golfer: Golfer;
  weekPoints: number;
  monthPoints?: number;
  seasonPoints: number;
  weekScores?: TournamentScore[];
  monthScores?: TournamentScore[];
  seasonScores?: TournamentScore[];
  isCaptain: boolean;
}

// Golfer for list display (lighter than full Golfer)
export interface GolferListItem {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  isActive: boolean;
  stats2025: GolferStats;
  stats2026?: GolferStats;
  points?: GolferPoints;
}

// ============================================
// User & Leaderboard Types
// ============================================

// Fantasy user with points (for leaderboard, users list)
export interface FantasyUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekRank?: number;
  monthRank?: number;
  seasonRank?: number;
  teamSize?: number;
  totalSpent?: number;
  createdAt?: string;
}

// Extended leaderboard entry (with all period points)
export interface LeaderboardEntryFull {
  userId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  totalPoints: number;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  rank: number;
  previousRank?: number;
  movement?: number;
}

// ============================================
// API Response Types (endpoint-specific)
// ============================================

export interface MyTeamResponse {
  hasTeam: boolean;
  transfersOpen: boolean;
  transfersUsedThisWeek?: number;
  maxTransfersPerWeek?: number;
  teamCreatedAt?: string;
  teamEffectiveStart?: string;
  team?: {
    golfers: GolferWithScores[];
    totalSpent: number;
    weekTotal: number;
    seasonTotal: number;
    captainId?: string | null;
  };
  period?: PeriodInfo;
}

export interface UserProfileResponse {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    createdAt: string;
  };
  hasTeam: boolean;
  teamCreatedAt?: string;
  teamEffectiveStart?: string;
  stats?: {
    weekPoints: number;
    monthPoints: number;
    seasonPoints: number;
    weekRank: number;
    monthRank: number;
    seasonRank: number;
  };
  team?: {
    golfers: GolferWithScores[];
    totalSpent: number;
    weekTotal: number;
    seasonTotal: number;
    captainId?: string | null;
  };
  period?: PeriodInfo;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntryFull[];
  period: PeriodInfo;
  totalUsers: number;
}

export interface DashboardResponse {
  user: FantasyUser;
  hasTeam: boolean;
  transfersOpen: boolean;
  settings: {
    currentSeason: number;
    transfersOpen: boolean;
    transferDeadline?: string;
  };
  leaderboard: LeaderboardEntryFull[];
  upcomingTournaments: Array<{
    id: string;
    name: string;
    date: string;
    status: string;
    multiplier: number;
  }>;
}
