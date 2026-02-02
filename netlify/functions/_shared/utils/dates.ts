// Shared date utilities for backend functions

// Week starts on Saturday at midnight for tournament counting purposes
const WEEK_START_HOUR = 0;

// Team eligibility starts at 8am on Saturday (for when new teams can start earning points)
const TEAM_ELIGIBILITY_HOUR = 8;

/**
 * Get Saturday midnight of the week containing the given date
 * Week runs from Saturday 00:00 to the following Friday 23:59:59
 */
export const getWeekStart = (date: Date = new Date()): Date => {
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
 * Get the end of a week (Friday 23:59:59.999) given the week start
 */
export const getWeekEnd = (weekStart: Date): Date => {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
};

/**
 * Get the start of the NEXT week after a given date (at 8am for team eligibility)
 * Used to calculate when a newly created team should start earning points
 */
export const getNextWeekStart = (date: Date): Date => {
  const currentWeekStart = getWeekStart(date);
  const nextWeek = new Date(currentWeekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  // Use 8am for team eligibility
  nextWeek.setHours(TEAM_ELIGIBILITY_HOUR, 0, 0, 0);
  return nextWeek;
};

/**
 * Calculate the effective start date for a team to earn points
 * A team only earns points from tournaments starting on or after the
 * next week start from when the team was created
 *
 * If createdAt is missing/invalid (for existing teams before this feature),
 * return a far-past date so they get all historical points (grandfathered in)
 */
export const getTeamEffectiveStartDate = (teamCreatedAt: Date | string | number | undefined | null): Date => {
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

  return getNextWeekStart(date);
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
 * Get start of the season (January 1st at 8am of the given year)
 */
export const getSeasonStart = (year: number = 2026): Date => {
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
