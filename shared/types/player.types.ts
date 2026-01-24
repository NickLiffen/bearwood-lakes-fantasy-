// Player domain types

// Membership type options
export type MembershipType = 'men' | 'junior' | 'female' | 'senior';

// 2025 performance stats for player selection display
export interface Player2025Stats {
  timesScored36Plus: number;      // Times shot 36 points or above
  timesFinished1st: number;        // Times finished 1st place
  timesFinished2nd: number;        // Times finished 2nd place
  timesFinished3rd: number;        // Times finished 3rd place
  timesPlayed: number;             // Total times played (roll up, medal, board event)
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  membershipType: MembershipType;
  isActive: boolean;
  stats2025: Player2025Stats;
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
}

export interface UpdatePlayerDTO {
  firstName?: string;
  lastName?: string;
  picture?: string;
  price?: number;
  membershipType?: MembershipType;
  isActive?: boolean;
  stats2025?: Player2025Stats;
}
