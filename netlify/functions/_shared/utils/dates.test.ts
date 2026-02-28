import {
  getWeekStart,
  getWeekEnd,
  getNextWeekStart,
  getTeamEffectiveStartDate,
  getMonthStart,
  getMonthEnd,
  getSeasonStart,
  getCurrentSeason,
  formatDateString,
  isDateInPeriod,
  getSeasonFirstSaturday,
  getGameweekNumber,
} from './dates';

describe('getWeekStart', () => {
  it('returns same Saturday at midnight for a Saturday', () => {
    // 2025-01-04 is a Saturday
    const sat = new Date(2025, 0, 4, 14, 30);
    const result = getWeekStart(sat);
    expect(result.getDay()).toBe(6); // Saturday
    expect(result.getDate()).toBe(4);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('returns previous Saturday for a Sunday', () => {
    // 2025-01-05 is a Sunday
    const sun = new Date(2025, 0, 5, 10, 0);
    const result = getWeekStart(sun);
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4);
  });

  it('returns previous Saturday for a Monday', () => {
    // 2025-01-06 is a Monday
    const mon = new Date(2025, 0, 6);
    const result = getWeekStart(mon);
    expect(result.getDate()).toBe(4);
  });

  it('returns previous Saturday for a Tuesday', () => {
    const tue = new Date(2025, 0, 7);
    const result = getWeekStart(tue);
    expect(result.getDate()).toBe(4);
  });

  it('returns previous Saturday for a Wednesday', () => {
    const wed = new Date(2025, 0, 8);
    const result = getWeekStart(wed);
    expect(result.getDate()).toBe(4);
  });

  it('returns previous Saturday for a Thursday', () => {
    const thu = new Date(2025, 0, 9);
    const result = getWeekStart(thu);
    expect(result.getDate()).toBe(4);
  });

  it('returns previous Saturday for a Friday', () => {
    // 2025-01-10 is a Friday
    const fri = new Date(2025, 0, 10, 23, 59);
    const result = getWeekStart(fri);
    expect(result.getDate()).toBe(4);
  });

  it('sets time to midnight', () => {
    const result = getWeekStart(new Date(2025, 0, 7, 15, 45, 30));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('handles month boundary', () => {
    // 2025-02-01 is a Saturday
    const result = getWeekStart(new Date(2025, 1, 3)); // Monday Feb 3
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(1);
  });
});

describe('getWeekEnd', () => {
  it('returns 6 days 23:59:59.999 after week start', () => {
    const weekStart = new Date(2025, 0, 4, 0, 0, 0, 0); // Saturday
    const result = getWeekEnd(weekStart);
    expect(result.getDate()).toBe(10); // Following Friday
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });
});

describe('getNextWeekStart', () => {
  it('returns the following Saturday at 8am', () => {
    // If current week starts Saturday Jan 4, next week starts Jan 11
    const date = new Date(2025, 0, 6); // Monday Jan 6
    const result = getNextWeekStart(date);
    expect(result.getDay()).toBe(6); // Saturday
    expect(result.getDate()).toBe(11);
    expect(result.getHours()).toBe(8);
  });

  it('returns next Saturday at 8am when date is Saturday', () => {
    const sat = new Date(2025, 0, 4); // Saturday
    const result = getNextWeekStart(sat);
    expect(result.getDate()).toBe(11);
    expect(result.getHours()).toBe(8);
  });
});

describe('getTeamEffectiveStartDate', () => {
  it('returns far past date for null', () => {
    const result = getTeamEffectiveStartDate(null);
    expect(result.getFullYear()).toBe(2000);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });

  it('returns far past date for undefined', () => {
    const result = getTeamEffectiveStartDate(undefined);
    expect(result.getFullYear()).toBe(2000);
  });

  it('returns far past date for invalid date string', () => {
    const result = getTeamEffectiveStartDate('not-a-date');
    expect(result.getFullYear()).toBe(2000);
  });

  it('returns next week start for valid Date', () => {
    const created = new Date(2025, 0, 6); // Monday Jan 6
    const result = getTeamEffectiveStartDate(created);
    expect(result.getDay()).toBe(6); // Saturday
    expect(result.getHours()).toBe(8);
    expect(result > created).toBe(true);
  });

  it('handles ISO string input', () => {
    const result = getTeamEffectiveStartDate('2025-01-06T12:00:00Z');
    expect(result.getDay()).toBe(6);
  });

  it('handles numeric timestamp', () => {
    const ts = new Date(2025, 0, 6).getTime();
    const result = getTeamEffectiveStartDate(ts);
    expect(result.getDay()).toBe(6);
  });
});

describe('getMonthStart', () => {
  it('returns first day of month at midnight', () => {
    const result = getMonthStart(new Date(2025, 5, 15));
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(5);
    expect(result.getHours()).toBe(0);
  });

  it('handles January', () => {
    const result = getMonthStart(new Date(2025, 0, 31));
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });
});

describe('getMonthEnd', () => {
  it('returns last day of month at 23:59:59.999', () => {
    const result = getMonthEnd(new Date(2025, 0, 15)); // January
    expect(result.getDate()).toBe(31);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });

  it('handles February (non-leap year)', () => {
    const result = getMonthEnd(new Date(2025, 1, 10));
    expect(result.getDate()).toBe(28);
  });

  it('handles February (leap year)', () => {
    const result = getMonthEnd(new Date(2024, 1, 10));
    expect(result.getDate()).toBe(29);
  });
});

describe('getSeasonStart', () => {
  it('returns Jan 1 at midnight of given year', () => {
    const result = getSeasonStart(2025);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
  });

  it('defaults to 2026', () => {
    const result = getSeasonStart();
    expect(result.getFullYear()).toBe(2026);
  });
});

describe('getCurrentSeason', () => {
  it('returns current year', () => {
    expect(getCurrentSeason()).toBe(new Date().getFullYear());
  });
});

describe('formatDateString', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(formatDateString(new Date(2025, 0, 5))).toBe('2025-01-05');
  });

  it('pads single-digit month and day', () => {
    expect(formatDateString(new Date(2025, 2, 3))).toBe('2025-03-03');
  });

  it('handles December correctly', () => {
    expect(formatDateString(new Date(2025, 11, 25))).toBe('2025-12-25');
  });
});

describe('isDateInPeriod', () => {
  const start = new Date(2025, 0, 1);
  const end = new Date(2025, 0, 31);

  it('returns true for date within period', () => {
    expect(isDateInPeriod(new Date(2025, 0, 15), start, end)).toBe(true);
  });

  it('returns true for date equal to start', () => {
    expect(isDateInPeriod(start, start, end)).toBe(true);
  });

  it('returns true for date equal to end', () => {
    expect(isDateInPeriod(end, start, end)).toBe(true);
  });

  it('returns false for date before period', () => {
    expect(isDateInPeriod(new Date(2024, 11, 31), start, end)).toBe(false);
  });

  it('returns false for date after period', () => {
    expect(isDateInPeriod(new Date(2025, 1, 1), start, end)).toBe(false);
  });
});

describe('getSeasonFirstSaturday', () => {
  it('returns same date if already Saturday', () => {
    // 2025-01-04 is Saturday
    const result = getSeasonFirstSaturday(new Date(2025, 0, 4));
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4);
  });

  it('advances to next Saturday if not Saturday', () => {
    // 2025-01-01 is Wednesday → next Saturday is Jan 4
    const result = getSeasonFirstSaturday(new Date(2025, 0, 1));
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4);
  });

  it('advances from Friday to next day', () => {
    // 2025-01-03 is Friday → next Saturday is Jan 4
    const result = getSeasonFirstSaturday(new Date(2025, 0, 3));
    expect(result.getDate()).toBe(4);
  });

  it('sets time to midnight', () => {
    const result = getSeasonFirstSaturday(new Date(2025, 0, 1, 15, 30));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe('getGameweekNumber', () => {
  it('returns 1 for first Saturday of season', () => {
    const seasonStart = new Date(2025, 0, 1); // Wed Jan 1
    const firstSat = getSeasonFirstSaturday(seasonStart); // Jan 4
    expect(getGameweekNumber(firstSat, seasonStart)).toBe(1);
  });

  it('returns 2 for second week', () => {
    const seasonStart = new Date(2025, 0, 1);
    const secondWeek = new Date(2025, 0, 11); // Jan 11 = Saturday
    expect(getGameweekNumber(secondWeek, seasonStart)).toBe(2);
  });

  it('returns 0 for week before season starts', () => {
    const seasonStart = new Date(2025, 0, 1);
    // Dec 28, 2024 is a Saturday, one week before Jan 4
    const beforeSeason = new Date(2024, 11, 28);
    expect(getGameweekNumber(beforeSeason, seasonStart)).toBe(0);
  });

  it('calculates correct gameweek for mid-season', () => {
    const seasonStart = new Date(2025, 0, 1);
    // First Saturday is Jan 4 (GW1). Jan 11 = GW2, ..., Mar 15 = 10 weeks after Jan 4
    const tenWeeksLater = new Date(2025, 2, 15); // Saturday
    expect(getGameweekNumber(tenWeeksLater, seasonStart)).toBe(10);
  });
});
