// Golfer domain types

// Performance stats structure (used for all seasons)
export interface GolferSeasonStats {
  timesScored36Plus: number; // Times shot 36 points or above
  timesScored32Plus: number; // Times shot 32 points or above
  timesFinished1st: number; // Times finished 1st place
  timesFinished2nd: number; // Times finished 2nd place
  timesFinished3rd: number; // Times finished 3rd place
  timesPlayed: number; // Total times played
}

// Alias for backwards compatibility
export type Golfer2024Stats = GolferSeasonStats;
export type Golfer2025Stats = GolferSeasonStats;
export type Golfer2026Stats = GolferSeasonStats;

export interface Golfer {
  id: string;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  isActive: boolean;
  stats2024: Golfer2024Stats;
  stats2025: Golfer2025Stats;
  stats2026: Golfer2026Stats;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGolferDTO {
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  isActive?: boolean;
  stats2024?: Golfer2024Stats;
  stats2025?: Golfer2025Stats;
  stats2026?: Golfer2026Stats;
}

export interface UpdateGolferDTO {
  firstName?: string;
  lastName?: string;
  picture?: string;
  price?: number;
  isActive?: boolean;
  stats2024?: Golfer2024Stats;
  stats2025?: Golfer2025Stats;
  stats2026?: Golfer2026Stats;
}

// Backwards compatibility aliases (map old names to new)
export type golfer = Golfer;
export type PlayerSeasonStats = GolferSeasonStats;
export type Player2025Stats = Golfer2025Stats;
export type Player2026Stats = Golfer2026Stats;
export type CreatePlayerDTO = CreateGolferDTO;
export type UpdatePlayerDTO = UpdateGolferDTO;
