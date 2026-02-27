// Game rules and constants

export const BUDGET_CAP = 50_000_000; // $50m budget
export const MAX_GOLFERS = 6; // Exactly 6 golfers per team
export const MIN_GOLFERS = 6; // Must have exactly 6 golfers

// Backwards compatibility aliases
export const MAX_PLAYERS = MAX_GOLFERS;
export const MIN_PLAYERS = MIN_GOLFERS;

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
} as const;

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
