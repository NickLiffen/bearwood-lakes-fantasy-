// Utility formatters

/**
 * Format currency (golfer prices)
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

/**
 * Format price in millions (e.g., $5.5M)
 * This is the most commonly used price format in the app
 */
export const formatPrice = (price: number): string => {
  return `$${(price / 1000000).toFixed(1)}M`;
};

/**
 * Format date for display
 */
export const formatDate = (date: Date | string): string => {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
};

/**
 * Format date with time
 */
export const formatDateTime = (date: Date | string): string => {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

/**
 * Format golfer name
 */
export const formatPlayerName = (firstName: string, lastName: string): string => {
  return `${firstName} ${lastName}`;
};

/**
 * Format raw score for display.
 * Medal scores are nett-to-par: positive gets a "+" prefix (e.g. +2), negative keeps "-", zero stays "0".
 * Stableford scores are shown as-is (e.g. 36).
 */
export const formatRawScore = (
  rawScore: number | null,
  scoringFormat: 'stableford' | 'medal'
): string => {
  if (rawScore === null || rawScore === undefined) return '-';
  if (scoringFormat === 'medal' && rawScore > 0) return `+${rawScore}`;
  return String(rawScore);
};

/**
 * Get initials from first and last name
 */
export const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
};
