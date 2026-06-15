// Game rules and constants

export const BUDGET_CAP = 50_000_000; // $50m budget
export const MAX_GOLFERS = 6; // Exactly 6 golfers per team
export const MIN_GOLFERS = 6; // Must have exactly 6 golfers

// One-off promo: gameweeks during which every player gets UNLIMITED transfers
// (both the weekly transfer count and the per-transfer golfer-swap cap are lifted).
// Changes still defer to the following gameweek, so transfers made during GW12 are
// unlimited and apply for GW13 — the Club Champs weekend.
// Reset to [] after the Club Champs weekend to restore the normal transfer limits.
export const UNLIMITED_TRANSFER_GAMEWEEKS: readonly number[] = [12];

// Backwards compatibility aliases
export const MAX_PLAYERS = MAX_GOLFERS;
export const MIN_PLAYERS = MIN_GOLFERS;

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  TOURNAMENT_UPLOADER: 'tournament_uploader',
} as const;

import type { UserRole } from '@shared/types';

/** Roles that can access the admin portal */
export const ADMIN_PORTAL_ROLES: readonly UserRole[] = [ROLES.ADMIN, ROLES.TOURNAMENT_UPLOADER];

export const PASSWORD_MIN_LENGTH = 8;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

// Phone verification
export const PHONE_NUMBER_REGEX = /^\+447\d{9}$/;
export const VERIFICATION_CODE_LENGTH = 6;

// Scoring constants
export const POSITION_POINTS: Record<number, number> = { 1: 10, 2: 7, 3: 5 };
export const STABLEFORD_THRESHOLDS = { HIGH: 36, LOW: 32 } as const;
export const MEDAL_THRESHOLDS = { HIGH: 72, LOW: 76 } as const;
export const BONUS_POINTS = { HIGH: 3, LOW: 1 } as const;
