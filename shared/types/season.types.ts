// Season domain types

export type SeasonStatus = 'setup' | 'active' | 'complete';

export interface Season {
  id: string;
  name: string; // "2025", "2026"
  startDate: Date; // e.g., 2025-04-01
  endDate: Date; // e.g., 2026-03-30
  firstGameweekStart?: Date; // Override for GW1 start (e.g., Friday Apr 3 8am). Falls back to first Saturday if unset.
  isActive: boolean; // Only one season can be active at a time
  status: SeasonStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSeasonDTO {
  name: string;
  startDate: Date;
  endDate: Date;
  firstGameweekStart?: Date;
  isActive?: boolean;
  status?: SeasonStatus;
}

export interface UpdateSeasonDTO {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  firstGameweekStart?: Date;
  isActive?: boolean;
  status?: SeasonStatus;
}
