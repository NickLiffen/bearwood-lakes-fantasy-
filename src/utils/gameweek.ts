// Shared gameweek/period utilities — single source of truth for MyTeamPage, UserProfilePage, and LeaderboardPage

export interface PeriodOption {
  value: string;
  label: string;
}

/** Get Saturday midnight of the week containing the given date */
export const getSaturdayOfWeek = (date: Date): Date => {
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

/** Calculate gameweek number from a week start date and season start */
export const getGameweekNumber = (weekStart: Date, seasonStartDate: Date): number => {
  const firstSaturday = getSeasonFirstSaturday(seasonStartDate);
  const diffMs = weekStart.getTime() - firstSaturday.getTime();
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
 * Starts from the season's first Saturday (or team effective start, whichever is later)
 * and goes forward to the current week (or GW1 if pre-season).
 * Returns most recent first.
 */
export const generateWeekOptions = (
  teamEffectiveStart: string,
  seasonStartDate?: string,
): PeriodOption[] => {
  const options: PeriodOption[] = [];
  const now = new Date();
  const currentWeekSat = getSaturdayOfWeek(now);

  if (seasonStartDate) {
    const firstSaturday = getSeasonFirstSaturday(new Date(seasonStartDate));
    const effectiveStart = new Date(teamEffectiveStart);
    effectiveStart.setHours(0, 0, 0, 0);

    // Start from whichever is later: first Saturday of season or team effective start
    const start =
      firstSaturday >= effectiveStart ? firstSaturday : getSaturdayOfWeek(effectiveStart);

    // Generate forward from start to current week (or first Saturday if pre-season)
    const endWeek = now < firstSaturday ? firstSaturday : currentWeekSat;
    let current = new Date(start);
    while (current <= endWeek) {
      const gw = getGameweekNumber(current, new Date(seasonStartDate));
      options.push({
        value: formatDateString(current),
        label: formatWeekLabel(current, gw),
      });
      current = new Date(current);
      current.setDate(current.getDate() + 7);
    }

    options.reverse();
  } else {
    // Fallback: generate backwards from current week to team effective start
    const effectiveStart = new Date(teamEffectiveStart);
    effectiveStart.setHours(0, 0, 0, 0);
    let current = currentWeekSat;
    while (current >= effectiveStart) {
      options.push({
        value: formatDateString(current),
        label: formatWeekLabel(current),
      });
      current = new Date(current);
      current.setDate(current.getDate() - 7);
    }
  }

  // Always include at least one option
  if (options.length === 0) {
    options.push({
      value: formatDateString(currentWeekSat),
      label: formatWeekLabel(currentWeekSat),
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

  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= now) {
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
