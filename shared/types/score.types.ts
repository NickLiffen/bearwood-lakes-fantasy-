// Score domain types

export interface Score {
  id: string;
  tournamentId: string;
  golferId: string;
  participated: boolean; // Did the golfer participate in this tournament?
  position: number | null; // 1, 2, 3 for podium, null for others
  rawScore: number | null; // Actual stableford/medal score (required if participated)
  basePoints: number; // Points from position (10, 7, 5, or 0)
  bonusPoints: number; // 3 or 1 based on rawScore thresholds, 0 otherwise
  multipliedPoints: number; // (basePoints + bonusPoints) * multiplier
  createdAt: Date;
  updatedAt: Date;
}

export interface GolferTournamentScore {
  golferId: string;
  golferName: string;
  participated: boolean;
  position: number | null;
  rawScore: number | null;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  totalPoints: number;
  rank: number;
}

export interface EnterScoreRequest {
  tournamentId: string;
  golferId: string;
  participated: boolean;
  position: number | null;
  rawScore: number | null;
}

export interface BulkEnterScoresRequest {
  tournamentId: string;
  scores: Array<{
    golferId: string;
    participated: boolean;
    position: number | null;
    rawScore: number | null;
  }>;
}
