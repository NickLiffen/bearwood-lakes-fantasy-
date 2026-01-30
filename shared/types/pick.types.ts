// Pick domain types

import type { Golfer } from './golfer.types';

export interface Pick {
  id: string;
  userId: string;
  golferIds: string[];
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
  totalSpent: number;
  season: number;
  changedAt: Date;
  reason: string;
}
