// Pick domain types

import type { Player } from './player.types';

export interface Pick {
  id: string;
  userId: string;
  playerIds: string[];
  totalSpent: number;
  season: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PickWithPlayers extends Omit<Pick, 'playerIds'> {
  players: Player[];
}

export interface SavePicksRequest {
  playerIds: string[];
}

export interface UserPicksSummary {
  userId: string;
  username: string;
  playerCount: number;
  totalSpent: number;
  picks: PickWithPlayers | null;
}

// Pick History for audit trail
export interface PickHistory {
  id: string;
  userId: string;
  playerIds: string[];
  totalSpent: number;
  season: number;
  changedAt: Date;
  reason: string;
}
