// Tournament domain types

export type TournamentStatus = 'draft' | 'published' | 'complete';
export type TournamentType = 'regular' | 'elevated' | 'signature';
export type PlayerCountTier = '0-10' | '10-20' | '20+';

export interface Tournament {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  tournamentType: TournamentType;
  multiplier: number; // 1 for regular, 2 for elevated, 3 for signature
  playerCountTier: PlayerCountTier;
  season: number;
  status: TournamentStatus;
  participatingPlayerIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTournamentDTO {
  name: string;
  startDate: Date;
  endDate: Date;
  tournamentType?: TournamentType;
  playerCountTier?: PlayerCountTier;
  season?: number;
}

export interface UpdateTournamentDTO {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  tournamentType?: TournamentType;
  playerCountTier?: PlayerCountTier;
  status?: TournamentStatus;
  participatingPlayerIds?: string[];
}

export interface TournamentWithScores extends Tournament {
  scores: Array<{
    playerId: string;
    playerName: string;
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

// Helper to calculate base points from position and player count tier
export function getBasePointsForPosition(position: number | null, tier: PlayerCountTier): number {
  if (position === null) return 0;
  
  switch (tier) {
    case '0-10':
      // Only 1st place gets points
      return position === 1 ? 5 : 0;
    case '10-20':
      // 1st and 2nd get points
      if (position === 1) return 5;
      if (position === 2) return 2;
      return 0;
    case '20+':
      // 1st, 2nd, 3rd get points
      if (position === 1) return 5;
      if (position === 2) return 3;
      if (position === 3) return 1;
      return 0;
    default:
      return 0;
  }
}
