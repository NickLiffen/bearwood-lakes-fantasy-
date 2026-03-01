// Tournament domain types

export type TournamentStatus = 'draft' | 'published' | 'complete';
export type TournamentType =
  | 'rollup_stableford'
  | 'weekday_medal'
  | 'weekend_medal'
  | 'presidents_cup'
  | 'founders'
  | 'club_champs_nett';
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
  isMultiDay: boolean;
  multiplier: number;
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
  isMultiDay?: boolean;
  golferCountTier?: GolferCountTier;
  season?: number;
}

export interface UpdateTournamentDTO {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  tournamentType?: TournamentType;
  scoringFormat?: ScoringFormat;
  isMultiDay?: boolean;
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

// Tournament type configuration — single source of truth
export const TOURNAMENT_TYPE_CONFIG: Record<
  TournamentType,
  {
    label: string;
    multiplier: number;
    defaultScoringFormat: ScoringFormat;
    forcedScoringFormat: ScoringFormat | null; // null = user can choose
    defaultMultiDay: boolean;
  }
> = {
  rollup_stableford: {
    label: 'Rollup Stableford',
    multiplier: 1,
    defaultScoringFormat: 'stableford',
    forcedScoringFormat: 'stableford',
    defaultMultiDay: false,
  },
  weekday_medal: {
    label: 'Weekday Medal',
    multiplier: 1,
    defaultScoringFormat: 'medal',
    forcedScoringFormat: 'medal',
    defaultMultiDay: false,
  },
  weekend_medal: {
    label: 'Weekend Medal',
    multiplier: 2,
    defaultScoringFormat: 'medal',
    forcedScoringFormat: 'medal',
    defaultMultiDay: false,
  },
  presidents_cup: {
    label: 'Presidents Cup',
    multiplier: 3,
    defaultScoringFormat: 'stableford',
    forcedScoringFormat: null,
    defaultMultiDay: false,
  },
  founders: {
    label: 'Founders',
    multiplier: 4,
    defaultScoringFormat: 'stableford',
    forcedScoringFormat: null,
    defaultMultiDay: true,
  },
  club_champs_nett: {
    label: 'Club Champs Nett',
    multiplier: 5,
    defaultScoringFormat: 'medal',
    forcedScoringFormat: null,
    defaultMultiDay: true,
  },
};

// Helper to get multiplier from tournament type
export function getMultiplierForType(type: TournamentType): number {
  return TOURNAMENT_TYPE_CONFIG[type]?.multiplier ?? 1;
}

// Helper to get display label for tournament type
export function getTournamentTypeLabel(type: TournamentType): string {
  return TOURNAMENT_TYPE_CONFIG[type]?.label ?? type;
}

// Position-based points (same for all field sizes)
const POSITION_POINTS: Record<number, number> = { 1: 10, 2: 7, 3: 5 };

// Helper to calculate base points from position
export function getBasePointsForPosition(position: number | null): number {
  if (position === null) return 0;
  return POSITION_POINTS[position] ?? 0;
}

// Helper to calculate bonus points from raw score, scoring format, and multi-day
export function getBonusPoints(
  rawScore: number | null,
  scoringFormat: ScoringFormat,
  isMultiDay: boolean = false
): number {
  if (rawScore === null) return 0;

  if (scoringFormat === 'stableford') {
    if (isMultiDay) {
      // Multi-day stableford: doubled thresholds
      if (rawScore >= 72) return 3;
      if (rawScore >= 64) return 1;
      return 0;
    }
    // Single-day stableford
    if (rawScore >= 36) return 3;
    if (rawScore >= 32) return 1;
    return 0;
  }

  // Medal (nett score: 0 = par, negative = under par)
  if (isMultiDay) {
    // Multi-day medal
    if (rawScore <= 0) return 3;
    if (rawScore <= 8) return 1;
    return 0;
  }
  // Single-day medal
  if (rawScore <= 0) return 3;
  if (rawScore <= 4) return 1;
  return 0;
}
