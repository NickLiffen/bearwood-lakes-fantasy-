// Shared date utilities for backend functions

// Week starts on Saturday at midnight (local server time) for tournament counting purposes
const WEEK_START_HOUR = 0;

// The UK timezone used for all user-facing deadlines (handles GMT ↔ BST automatically)
const UK_TIMEZONE = 'Europe/London';

// Team eligibility / transfer deadline is 8am UK local time on Saturday.
// Used inside getTransferDeadline() for the actual UK-local deadline computation.
export const TEAM_ELIGIBILITY_HOUR = 8;

/**
 * Get the transfer deadline as a UTC Date for a given Saturday week-start.
 *
 * The deadline is Saturday at TEAM_ELIGIBILITY_HOUR (8am) **UK local time** (Europe/London).
 * During BST (late March – late October) this is 07:00 UTC.
 * During GMT (late October – late March) this is 08:00 UTC.
 */
export const getTransferDeadline = (weekStart: Date): Date => {
  // weekStart is computed using local setHours() throughout the codebase,
  // so we use local getters to extract the calendar date.
  const year = weekStart.getFullYear();
  const month = String(weekStart.getMonth() + 1).padStart(2, '0');
  const day = String(weekStart.getDate()).padStart(2, '0');
  const hourStr = String(TEAM_ELIGIBILITY_HOUR).padStart(2, '0');

  // Use Intl to find the UTC offset for this date in Europe/London
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Create a candidate date at TEAM_ELIGIBILITY_HOUR UTC, then adjust for the UK offset
  const candidateUtc = new Date(`${year}-${month}-${day}T${hourStr}:00:00Z`);
  const parts = formatter.formatToParts(candidateUtc);
  const ukHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);

  // If the UK hour differs from TEAM_ELIGIBILITY_HOUR, adjust by the offset
  // e.g. BST: ukHour=9 when we set 08:00 UTC → offset=+1 → subtract 1h → 07:00 UTC
  const offsetHours = ukHour - TEAM_ELIGIBILITY_HOUR;
  const deadline = new Date(candidateUtc.getTime() - offsetHours * 60 * 60 * 1000);
  return deadline;
};

/** Check if two dates fall on the same calendar day */
const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Get the start of the gameweek containing the given date.
 *
 * Normal weeks run Saturday 00:00 → Friday 23:59:59.
 * When `firstGameweekStart` is supplied, GW1 may begin on a non-Saturday.
 * GW1 runs from `firstGameweekStart` at 00:00 until the Saturday that is
 * 7 days after the first Saturday on or after `firstGameweekStart`.
 * All subsequent weeks follow the normal Saturday cadence.
 */
export const getWeekStart = (date: Date = new Date(), firstGameweekStart?: Date | null): Date => {
  // If a custom GW1 start is provided, check whether `date` falls inside GW1
  if (firstGameweekStart) {
    const gw1Start = new Date(firstGameweekStart);
    gw1Start.setHours(0, 0, 0, 0);

    // GW2 begins on the Saturday 7 days after the first Sat on or after GW1
    const firstSat = getSeasonFirstSaturday(firstGameweekStart);
    const gw2Start = new Date(firstSat);
    gw2Start.setDate(gw2Start.getDate() + 7);
    gw2Start.setHours(0, 0, 0, 0);

    if (date >= gw1Start && date < gw2Start) {
      return gw1Start;
    }
  }

  // Standard Saturday-based week logic
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday

  // Calculate days to subtract to get to the previous Saturday
  let daysSinceSaturday: number;
  if (dayOfWeek === 6) {
    // Saturday - we're at the start of the week
    daysSinceSaturday = 0;
  } else {
    // Sunday = 1 day since Saturday, Monday = 2, etc.
    daysSinceSaturday = dayOfWeek + 1;
  }

  d.setDate(d.getDate() - daysSinceSaturday);
  d.setHours(WEEK_START_HOUR, 0, 0, 0);
  return d;
};

/**
 * Get the end of a gameweek given its start.
 *
 * For a normal Saturday-started week the end is weekStart + 7 days − 1 ms
 * (i.e. Friday 23:59:59.999).
 *
 * For GW1 (when `weekStart` matches `firstGameweekStart`), the end is
 * the day before GW2 starts — i.e. the Friday before the second Saturday
 * on or after `firstGameweekStart`.
 */
export const getWeekEnd = (weekStart: Date, firstGameweekStart?: Date | null): Date => {
  if (firstGameweekStart) {
    const gw1Start = new Date(firstGameweekStart);
    gw1Start.setHours(0, 0, 0, 0);

    if (isSameDay(weekStart, gw1Start)) {
      // GW2 starts on the Saturday 7 days after the first Sat on or after GW1
      const firstSat = getSeasonFirstSaturday(firstGameweekStart);
      const gw2Start = new Date(firstSat);
      gw2Start.setDate(gw2Start.getDate() + 7);
      gw2Start.setHours(0, 0, 0, 0);
      return new Date(gw2Start.getTime() - 1);
    }
  }

  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
};

/**
 * Get start of the NEXT week after a given date (at 8am for team eligibility).
 *
 * When `firstGameweekStart` is supplied and the date falls within GW1,
 * the next week is GW2 — the Saturday 7 days after the first Saturday
 * on or after `firstGameweekStart`, at 8 am.
 */
export const getNextWeekStart = (date: Date, firstGameweekStart?: Date | null): Date => {
  const currentWeekStart = getWeekStart(date, firstGameweekStart);

  // If we're inside GW1, the next week is GW2 (first normal Saturday cadence)
  if (firstGameweekStart) {
    const gw1Start = new Date(firstGameweekStart);
    gw1Start.setHours(0, 0, 0, 0);

    if (isSameDay(currentWeekStart, gw1Start)) {
      const firstSat = getSeasonFirstSaturday(firstGameweekStart);
      const gw2Start = new Date(firstSat);
      gw2Start.setDate(gw2Start.getDate() + 7);
      gw2Start.setHours(0, 0, 0, 0);
      return getTransferDeadline(gw2Start);
    }
  }

  const nextWeek = new Date(currentWeekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(0, 0, 0, 0);
  return getTransferDeadline(nextWeek);
};

/**
 * Calculate the effective start date for a team to earn points
 * A team only earns points from tournaments starting on or after the
 * next week start from when the team was created
 *
 * If createdAt is missing/invalid (for existing teams before this feature),
 * return a far-past date so they get all historical points (grandfathered in)
 */
export const getTeamEffectiveStartDate = (
  teamCreatedAt: Date | string | number | undefined | null,
  firstGameweekStart?: Date | null
): Date => {
  // If no createdAt, team is grandfathered in - use a date far in the past
  if (!teamCreatedAt) {
    return new Date(2000, 0, 1); // Far in the past - team gets all points
  }

  // Try to convert to a valid Date (handles Date objects, ISO strings, timestamps)
  const date = new Date(teamCreatedAt);

  // If conversion failed, grandfather them in
  if (isNaN(date.getTime())) {
    return new Date(2000, 0, 1);
  }

  // If team was created before GW1 kickoff, start earning from GW1
  if (firstGameweekStart) {
    const gw1 = new Date(firstGameweekStart);
    gw1.setHours(0, 0, 0, 0);
    if (date < gw1) {
      return gw1;
    }
  }

  return getNextWeekStart(date, firstGameweekStart);
};

/**
 * Get first day of the month at 8am (aligned with week start time)
 */
export const getMonthStart = (date: Date = new Date()): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1, WEEK_START_HOUR, 0, 0, 0);
};

/**
 * Get last day of the month at 23:59:59.999
 */
export const getMonthEnd = (date: Date = new Date()): Date => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};

/**
 * Get start of the season (January 1st at WEEK_START_HOUR of the given year)
 */
export const getSeasonStart = (year: number = new Date().getFullYear()): Date => {
  return new Date(year, 0, 1, WEEK_START_HOUR, 0, 0, 0);
};

/**
 * Get current season year
 */
export const getCurrentSeason = (): number => {
  return new Date().getFullYear();
};

/**
 * Format date as YYYY-MM-DD string
 */
export const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Check if a date falls within a period
 */
export const isDateInPeriod = (date: Date, periodStart: Date, periodEnd: Date): boolean => {
  return date >= periodStart && date <= periodEnd;
};

/**
 * Get the first Saturday on or after a given date
 * Used to determine the start of Gameweek 1 for a season
 */
export const getSeasonFirstSaturday = (seasonStartDate: Date): Date => {
  const d = new Date(seasonStartDate);
  while (d.getDay() !== 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get the anchor date for GW1.
 *
 * If `firstGameweekStart` is provided, returns it (normalised to midnight).
 * Otherwise falls back to the first Saturday on or after `seasonStartDate`.
 */
export const getFirstGameweekStart = (
  seasonStartDate: Date,
  firstGameweekStart?: Date | null
): Date => {
  if (firstGameweekStart) {
    const d = new Date(firstGameweekStart);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return getSeasonFirstSaturday(seasonStartDate);
};

/**
 * Calculate gameweek number from a week start date and season start.
 *
 * Uses `getFirstGameweekStart()` as the anchor (day 0 = GW1).
 * floor(diffDays / 7) + 1 works for both the custom-length GW1 and all
 * subsequent 7-day weeks because the Saturday cadence aligns after GW1.
 */
export const getGameweekNumber = (
  weekStart: Date,
  seasonStartDate: Date,
  firstGameweekStart?: Date | null
): number => {
  const anchor = getFirstGameweekStart(seasonStartDate, firstGameweekStart);
  const diffMs = weekStart.getTime() - anchor.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
};

/**
 * Determine whether unlimited transfers apply right now.
 *
 * Unlimited transfers are granted when ANY of these is true:
 *  1. Before the season start date (pre-season)
 *  2. Before the first gameweek starts (season active but GW1 hasn't begun)
 *  3. Before the team's effective start date (grace period for newly created teams)
 */
export const hasUnlimitedTransfers = (
  seasonStartDate: Date | null,
  firstGameweekStart: Date | null,
  teamCreatedAt?: Date | string | number | null,
  now: Date = new Date()
): boolean => {
  const isPreSeason = seasonStartDate ? now < seasonStartDate : false;

  // Use the raw firstGameweekStart (preserves configured time, e.g. 8am)
  // and only fall back to the calculated first Saturday when it's unset.
  const firstGWDate = seasonStartDate
    ? firstGameweekStart
      ? new Date(firstGameweekStart)
      : getSeasonFirstSaturday(seasonStartDate)
    : null;
  const isBeforeFirstGameweek = firstGWDate ? now < firstGWDate : false;

  const teamEffectiveStart =
    teamCreatedAt !== undefined
      ? getTeamEffectiveStartDate(teamCreatedAt, firstGameweekStart)
      : null;
  const isPreFirstGameWeek = teamEffectiveStart ? now < teamEffectiveStart : false;

  return isPreSeason || isBeforeFirstGameweek || isPreFirstGameWeek;
};
