// Pick domain types

import type { Golfer } from './golfer.types';

/** Roster snapshot for a single gameweek (golfers + captain active during that GW). */
export interface GameweekRoster {
  golferIds: string[];
  captainId: string | null;
}

export interface Pick {
  id: string;
  userId: string;
  golferIds: string[];
  captainId: string | null;
  pendingGolferIds?: string[];
  pendingCaptainId?: string | null;
  pendingChangedAt?: Date;
  /** Per-gameweek roster snapshots. Key = gameweek number (as string). */
  gameweekRosters?: Record<string, GameweekRoster>;
  /** Union of all golfer IDs across all gameweek rosters (for historical score lookups). */
  allGolferIds?: string[];
  totalSpent: number;
  season: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PickWithGolfers extends Omit<Pick, 'golferIds'> {
  golfers: Golfer[];
}

export interface SavePicksRequest {
  golferIds: string[];
  captainId?: string | null;
}

export interface UserPicksSummary {
  userId: string;
  username: string;
  golferCount: number;
  totalSpent: number;
  picks: PickWithGolfers | null;
}

// Pick History for audit trail
export interface PickHistory {
  id: string;
  userId: string;
  golferIds: string[];
  captainId?: string | null;
  totalSpent: number;
  season: number;
  changedAt: Date;
  reason: string;
}
