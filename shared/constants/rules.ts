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
