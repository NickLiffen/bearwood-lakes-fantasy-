// Shared date utilities for backend functions

/**
 * Get Monday of the week containing the given date
 */
export const getWeekStart = (date: Date = new Date()): Date => {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysSinceMonday);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get first day of the month
 */
export const getMonthStart = (date: Date = new Date()): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
};

/**
 * Get start of the season (January 1st of the given year)
 */
export const getSeasonStart = (year: number = 2026): Date => {
  return new Date(year, 0, 1, 0, 0, 0, 0);
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
