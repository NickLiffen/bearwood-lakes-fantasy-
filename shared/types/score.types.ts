// Score domain types

export interface WeeklyScore {
  id: string;
  playerId: string;
  week: number;
  points: number;
  createdAt: Date;
}

export interface PlayerScore {
  playerId: string;
  playerName: string;
  weeklyScores: WeeklyScore[];
  totalPoints: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  weeklyPoints: number;
  totalPoints: number;
  rank: number;
}

export interface EnterScoreRequest {
  playerId: string;
  week: number;
  points: number;
}
