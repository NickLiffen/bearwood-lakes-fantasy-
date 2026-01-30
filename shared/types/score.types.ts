// Score domain types

export interface Score {
  id: string;
  tournamentId: string;
  golferId: string;
  participated: boolean; // Did the golfer participate in this tournament?
  position: number | null; // 1, 2, 3 for podium, null for others
  scored36Plus: boolean; // +1 bonus point if true
  basePoints: number; // Points from position (5, 3, 2, 1, or 0)
  bonusPoints: number; // 1 if scored36Plus, 0 otherwise
  multipliedPoints: number; // (basePoints + bonusPoints) * multiplier
  createdAt: Date;
  updatedAt: Date;
}

export interface GolferTournamentScore {
  golferId: string;
  golferName: string;
  participated: boolean;
  position: number | null;
  scored36Plus: boolean;
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
  scored36Plus: boolean;
}

export interface BulkEnterScoresRequest {
  tournamentId: string;
  scores: Array<{
    golferId: string;
    participated: boolean;
    position: number | null;
    scored36Plus: boolean;
  }>;
}
