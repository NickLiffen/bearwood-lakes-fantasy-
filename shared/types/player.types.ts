// Player domain types

// Membership type options
export type MembershipType = 'men' | 'junior' | 'female' | 'senior';

// Performance stats structure (used for both 2025 and 2026)
export interface PlayerSeasonStats {
  timesScored36Plus: number;      // Times shot 36 points or above
  timesFinished1st: number;        // Times finished 1st place
  timesFinished2nd: number;        // Times finished 2nd place
  timesFinished3rd: number;        // Times finished 3rd place
  timesPlayed: number;             // Total times played (roll up, medal, board event)
}

// Alias for backwards compatibility
export type Player2025Stats = PlayerSeasonStats;
export type Player2026Stats = PlayerSeasonStats;

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: MembershipType;
  isActive: boolean;
  stats2025: Player2025Stats;
  stats2026: Player2026Stats;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlayerDTO {
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: MembershipType;
  isActive?: boolean;
  stats2025?: Player2025Stats;
  stats2026?: Player2026Stats;
}

export interface UpdatePlayerDTO {
  firstName?: string;
  lastName?: string;
  picture?: string;
  price?: number;
  membershipType?: MembershipType;
  isActive?: boolean;
  stats2025?: Player2025Stats;
  stats2026?: Player2026Stats;
}
