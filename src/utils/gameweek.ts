// Shared gameweek/period utilities — single source of truth for MyTeamPage, UserProfilePage, and LeaderboardPage

import {
  resolveOverriddenWeekStart,
  normalizeWeekStartForNumbering,
  applyWeekStartOverrideForDisplay,
} from '@shared/constants/rules';

export interface PeriodOption {
  value: string;
  label: string;
}

/**
 * Get the Saturday midnight of the week containing the given date.
 * If firstGameweekStart is provided and the date falls within GW1
 * (>= firstGameweekStart at 00:00 and < GW2 start), returns firstGameweekStart at 00:00.
 */
export const getSaturdayOfWeek = (date: Date, firstGameweekStart?: string): Date => {
  // One-off gameweek boundary override (e.g. Club Champs GW13 pulled forward to Thursday).
  const overridden = resolveOverriddenWeekStart(date);
  if (overridden) return overridden;

  if (firstGameweekStart) {
    const gw1Start = new Date(firstGameweekStart);
    gw1Start.setHours(0, 0, 0, 0);
    const gw2Start = getGW2Start(firstGameweekStart);

    if (date >= gw1Start && date < gw2Start) {
      return new Date(gw1Start);
    }
  }

  const d = new Date(date);
  const dayOfWeek = d.getDay();
  let daysSinceSaturday: number;
  if (dayOfWeek === 6) {
    daysSinceSaturday = 0;
  } else {
    daysSinceSaturday = dayOfWeek + 1;
  }
  d.setDate(d.getDate() - daysSinceSaturday);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Get the first Saturday on or after a given date */
export const getSeasonFirstSaturday = (seasonStartDate: Date): Date => {
  const d = new Date(seasonStartDate);
  while (d.getDay() !== 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get the start date of GW1.
 * Returns firstGameweekStart (at 00:00) if provided, otherwise falls back
 * to the first Saturday on or after seasonStartDate.
 */
export const getFirstGameweekStart = (seasonStartDate: Date, firstGameweekStart?: string): Date => {
  if (firstGameweekStart) {
    const d = new Date(firstGameweekStart);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return getSeasonFirstSaturday(seasonStartDate);
};

/**
 * Get the start date of GW2.
 * GW2 begins on the first Saturday on or after firstGameweekStart, plus 7 days.
 * This ensures the Saturday cadence resumes after a potentially non-Saturday GW1.
 */
export const getGW2Start = (firstGameweekStart: string): Date => {
  const d = new Date(firstGameweekStart);
  // Find the first Saturday on or after the GW1 start
  while (d.getDay() !== 6) {
    d.setDate(d.getDate() + 1);
  }
  // Advance one full week to get GW2
  d.setDate(d.getDate() + 7);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Calculate gameweek number from a week start date and season start.
 * Uses firstGameweekStart as the anchor when provided; otherwise falls back
 * to the first Saturday on or after seasonStartDate.
 */
export const getGameweekNumber = (
  weekStart: Date,
  seasonStartDate: Date,
  firstGameweekStart?: string
): number => {
  const anchor = getFirstGameweekStart(seasonStartDate, firstGameweekStart);
  // Keep numbering anchored to the normal Saturday cadence so an overridden (early)
  // week-start still resolves to its normal gameweek number.
  const numberingWeekStart = normalizeWeekStartForNumbering(weekStart);
  const diffMs = numberingWeekStart.getTime() - anchor.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
};

/** Format date as YYYY-MM-DD */
export const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Format week label like "Gameweek 3: Sat, Feb 1, 2026" */
export const formatWeekLabel = (weekStart: Date, gameweek?: number | null): string => {
  const dateStr = weekStart.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (gameweek && gameweek > 0) {
    return `Gameweek ${gameweek}: ${dateStr}`;
  }
  return dateStr;
};

/**
 * Generate the full list of gameweek dropdown options.
 * Starts from the season's first gameweek (or team effective start, whichever is later)
 * and goes forward to the current week (or GW1 if pre-season).
 * Returns most recent first.
 *
 * When firstGameweekStart is provided, GW1 begins on that date (which may be a
 * non-Saturday like Friday). Subsequent gameweeks resume the normal Saturday cadence
 * starting from GW2.
 */
export const generateWeekOptions = (
  teamEffectiveStart: string,
  seasonStartDate?: string,
  firstGameweekStart?: string
): PeriodOption[] => {
  const options: PeriodOption[] = [];
  const now = new Date();
  const currentWeekStart = getSaturdayOfWeek(now, firstGameweekStart);

  if (seasonStartDate) {
    const gw1Start = getFirstGameweekStart(new Date(seasonStartDate), firstGameweekStart);
    const effectiveStart = new Date(teamEffectiveStart);
    effectiveStart.setHours(0, 0, 0, 0);

    // Start from whichever is later: GW1 start or team effective start.
    // Normalise any override start back to its Saturday so the cadence stays aligned.
    const start = normalizeWeekStartForNumbering(
      gw1Start >= effectiveStart ? gw1Start : getSaturdayOfWeek(effectiveStart, firstGameweekStart)
    );

    // Generate forward from start to current week (or GW1 if pre-season).
    // The loop iterates on the Saturday cadence, so the bound is normalised back to the
    // normal Saturday even when the current week's boundary is overridden.
    const endWeek = now < gw1Start ? gw1Start : normalizeWeekStartForNumbering(currentWeekStart);

    // GW1 may start on a non-Saturday, so we handle the first iteration specially
    // then jump to GW2 (normal Saturday cadence) for all subsequent weeks.
    let current = new Date(start);
    while (current <= endWeek) {
      const gw = getGameweekNumber(current, new Date(seasonStartDate), firstGameweekStart);
      // Emit the overridden (early) start as the option date when an override applies.
      const displayStart = applyWeekStartOverrideForDisplay(current);
      options.push({
        value: formatDateString(displayStart),
        label: formatWeekLabel(displayStart, gw),
      });

      if (firstGameweekStart && current.getTime() === gw1Start.getTime()) {
        // After GW1, jump to GW2 start (first Saturday cadence week)
        current = getGW2Start(firstGameweekStart);
      } else {
        current = new Date(current);
        current.setDate(current.getDate() + 7);
      }
    }

    options.reverse();
  } else {
    // Fallback: generate backwards from current week to team effective start.
    // Iterate on the Saturday cadence (normalised) and emit overridden display dates.
    const effectiveStart = new Date(teamEffectiveStart);
    effectiveStart.setHours(0, 0, 0, 0);
    let current = normalizeWeekStartForNumbering(currentWeekStart);
    while (current >= effectiveStart) {
      const displayStart = applyWeekStartOverrideForDisplay(current);
      options.push({
        value: formatDateString(displayStart),
        label: formatWeekLabel(displayStart),
      });
      current = new Date(current);
      current.setDate(current.getDate() - 7);
    }
  }

  // Always include at least one option
  if (options.length === 0) {
    const displayStart = applyWeekStartOverrideForDisplay(currentWeekStart);
    options.push({
      value: formatDateString(displayStart),
      label: formatWeekLabel(displayStart),
    });
  }

  return options;
};

/**
 * Generate the full list of month dropdown options for a season.
 * Starts from the season start month and goes to the current month.
 * Returns most recent first.
 */
export const generateMonthOptions = (seasonStartDate: string): PeriodOption[] => {
  const options: PeriodOption[] = [];
  const start = new Date(seasonStartDate);
  const now = new Date();

  // If pre-season, use the season start month as the end; otherwise use the current month
  const endMonth = now < start ? new Date(start.getFullYear(), start.getMonth(), 1) : now;

  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= endMonth) {
    const label = current.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');

    options.push({
      value: `${year}-${month}-01`,
      label,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return options.reverse();
};
