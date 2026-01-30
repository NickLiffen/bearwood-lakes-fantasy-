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
 * Get membership type label
 */
export const getMembershipLabel = (type: string): string => {
  switch (type) {
    case 'men': return "Men's Member";
    case 'junior': return 'Junior Member';
    case 'female': return 'Female Member';
    case 'senior': return 'Senior Member';
    default: return type;
  }
};

/**
 * Get membership CSS class
 */
export const getMembershipClass = (type: string): string => {
  switch (type) {
    case 'men': return 'membership-men';
    case 'junior': return 'membership-junior';
    case 'female': return 'membership-female';
    case 'senior': return 'membership-senior';
    default: return '';
  }
};

/**
 * Get initials from first and last name
 */
export const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
};
