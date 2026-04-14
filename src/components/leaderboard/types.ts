// Shared leaderboard types used across LeaderboardPage, LeagueDetailPage, etc.

export interface LeaderboardEntry {
  rank: number;
  oldRank: number | null;
  movement: 'up' | 'down' | 'same' | 'new';
  movementAmount: number;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  points: number;
  teamValue: number;
  eventsPlayed: number;
}

export interface PeriodInfo {
  type: 'week' | 'month' | 'season';
  startDate: string;
  endDate: string;
  label: string;
  gameweek?: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousDate?: string | null;
  nextDate?: string | null;
}
