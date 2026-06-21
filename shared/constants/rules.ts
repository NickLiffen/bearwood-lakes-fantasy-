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

/**
 * One-off gameweek boundary overrides.
 *
 * Each entry pulls a single gameweek's start *earlier* than its normal Saturday cadence.
 * `normalWeekStart` is the Saturday the gameweek would normally begin on; `overriddenWeekStart`
 * is the (earlier) calendar date it should actually begin on. Both are local calendar dates
 * in `YYYY-MM-DD` form.
 *
 * Current override — GW13 (Club Champs weekend): the Women's (Thu 25 Jun 2026), Seniors
 * (Fri 26 Jun) and Men's (Sat 27 Jun) championships all belong to GW13, so the gameweek —
 * and therefore the transfer deadline — is pulled forward from Sat 27 Jun to Thu 25 Jun
 * (8am UK). The preceding GW12 is shortened to Sat 20 Jun → Wed 24 Jun, and GW14 resumes
 * the normal Saturday cadence on Sat 4 Jul. The gameweek *number* stays anchored to the
 * normal Saturday, so the overridden week is still GW13 (not GW12).
 *
 * Reset to [] after the Club Champs weekend to restore the standard Saturday cadence.
 */
export const GAMEWEEK_BOUNDARY_OVERRIDES: readonly {
  normalWeekStart: string;
  overriddenWeekStart: string;
}[] = [{ normalWeekStart: '2026-06-27', overriddenWeekStart: '2026-06-25' }];

/** Parse a `YYYY-MM-DD` string to a local-midnight Date (avoids UTC-parsing pitfalls). */
function parseLocalMidnight(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Add `days` to a Date using local calendar arithmetic (DST-safe). */
function addLocalDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Whether two Dates fall on the same local calendar day. */
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * If `date` falls within an overridden gameweek window, return that gameweek's (earlier)
 * week-start at local midnight; otherwise return null.
 *
 * An overridden window spans `[overriddenWeekStart, normalWeekStart + 7 days)` — i.e. from
 * the early start through to where the normal Saturday cadence resumes.
 */
export function resolveOverriddenWeekStart(date: Date): Date | null {
  for (const o of GAMEWEEK_BOUNDARY_OVERRIDES) {
    const start = parseLocalMidnight(o.overriddenWeekStart);
    const end = addLocalDays(parseLocalMidnight(o.normalWeekStart), 7);
    if (date >= start && date < end) {
      return new Date(start);
    }
  }
  return null;
}

/**
 * Given a (midnight) week-start, return the midnight start of the *next* gameweek when an
 * override changes that boundary; otherwise null (the caller should use normal cadence).
 *
 * Handles two cases:
 *  - `weekStart` is the (shortened) week immediately *before* an override → the next
 *    boundary is the override's earlier start.
 *  - `weekStart` *is* an overridden week → the next boundary is where the normal Saturday
 *    cadence resumes (`normalWeekStart + 7 days`).
 */
export function resolveNextBoundaryFromOverride(weekStart: Date): Date | null {
  for (const o of GAMEWEEK_BOUNDARY_OVERRIDES) {
    const overriddenStart = parseLocalMidnight(o.overriddenWeekStart);
    const normalStart = parseLocalMidnight(o.normalWeekStart);
    const weekStartPlus7 = addLocalDays(weekStart, 7);

    if (overriddenStart > weekStart && overriddenStart < weekStartPlus7) {
      return new Date(overriddenStart);
    }
    if (isSameLocalDay(weekStart, overriddenStart)) {
      return addLocalDays(normalStart, 7);
    }
  }
  return null;
}

/**
 * For gameweek *numbering*, map an overridden (early) week-start back to its normal Saturday
 * so the gameweek number is unchanged (e.g. Club Champs Thu 25 Jun → Sat 27 Jun → GW13).
 * Returns the input unchanged when no override applies.
 */
export function normalizeWeekStartForNumbering(weekStart: Date): Date {
  for (const o of GAMEWEEK_BOUNDARY_OVERRIDES) {
    if (isSameLocalDay(weekStart, parseLocalMidnight(o.overriddenWeekStart))) {
      return parseLocalMidnight(o.normalWeekStart);
    }
  }
  return weekStart;
}

/**
 * For *display* (dropdown option dates), map a normal Saturday week-start to its overridden
 * (early) start when an override applies; otherwise return the input unchanged.
 */
export function applyWeekStartOverrideForDisplay(normalWeekStart: Date): Date {
  for (const o of GAMEWEEK_BOUNDARY_OVERRIDES) {
    if (isSameLocalDay(normalWeekStart, parseLocalMidnight(o.normalWeekStart))) {
      return parseLocalMidnight(o.overriddenWeekStart);
    }
  }
  return normalWeekStart;
}

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
