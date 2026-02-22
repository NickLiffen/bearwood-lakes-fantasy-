// Tournament domain types

export type TournamentStatus = 'draft' | 'published' | 'complete';
export type TournamentType = 'regular' | 'elevated' | 'signature';
export type ScoringFormat = 'stableford' | 'medal';
export type GolferCountTier = '0-10' | '10-20' | '20+';

// Backwards compatibility alias
export type PlayerCountTier = GolferCountTier;

export interface Tournament {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  tournamentType: TournamentType;
  scoringFormat: ScoringFormat;
  multiplier: number; // 1 for regular, 2 for elevated, 3 for signature
  golferCountTier: GolferCountTier;
  season: number;
  status: TournamentStatus;
  participatingGolferIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTournamentDTO {
  name: string;
  startDate: Date;
  endDate: Date;
  tournamentType?: TournamentType;
  scoringFormat?: ScoringFormat;
  golferCountTier?: GolferCountTier;
  season?: number;
}

export interface UpdateTournamentDTO {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  tournamentType?: TournamentType;
  scoringFormat?: ScoringFormat;
  golferCountTier?: GolferCountTier;
  status?: TournamentStatus;
  participatingGolferIds?: string[];
}

export interface TournamentWithScores extends Tournament {
  scores: Array<{
    golferId: string;
    golferName: string;
    position: number | null;
    basePoints: number;
    bonusPoints: number;
    multipliedPoints: number;
  }>;
}

// Helper to get multiplier from tournament type
export function getMultiplierForType(type: TournamentType): number {
  switch (type) {
    case 'regular': return 1;
    case 'elevated': return 2;
    case 'signature': return 3;
    default: return 1;
  }
}

// Position-based points (same for all field sizes)
const POSITION_POINTS: Record<number, number> = { 1: 10, 2: 7, 3: 5 };

// Helper to calculate base points from position (field size no longer matters)
export function getBasePointsForPosition(position: number | null): number {
  if (position === null) return 0;
  return POSITION_POINTS[position] ?? 0;
}

// Helper to calculate bonus points from raw score and scoring format
export function getBonusPoints(rawScore: number | null, scoringFormat: ScoringFormat): number {
  if (rawScore === null) return 0;

  if (scoringFormat === 'stableford') {
    if (rawScore >= 36) return 3;
    if (rawScore >= 32) return 1;
    return 0;
  }

  // Medal: lower is better
  if (rawScore <= 72) return 3;
  if (rawScore <= 76) return 1;
  return 0;
}
