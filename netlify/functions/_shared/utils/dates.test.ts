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
  getFirstGameweekStart,
  hasUnlimitedTransfers,
  getTransferDeadline,
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

  it('defaults to current year', () => {
    const result = getSeasonStart();
    expect(result.getFullYear()).toBe(new Date().getFullYear());
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
    const tenWeeksLater = new Date(2025, 2, 15); // Saturday Mar 15
    // Jan 4 → Mar 15 = 70 days = 10 full weeks → floor(10) + 1 = GW 11
    expect(getGameweekNumber(tenWeeksLater, seasonStart)).toBe(11);
  });
});

describe('GW1 Friday start (firstGameweekStart override)', () => {
  // 2026 season: startDate = Apr 1 (Wed), firstGameweekStart = Apr 3 (Fri)
  const seasonStart = new Date(2026, 3, 1);
  const firstGW = new Date(2026, 3, 3, 8, 0); // Friday April 3, 2026 8am

  describe('getFirstGameweekStart', () => {
    it('returns firstGameweekStart when provided', () => {
      const result = getFirstGameweekStart(seasonStart, firstGW);
      expect(result.getDate()).toBe(3);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getHours()).toBe(0); // normalized to midnight
    });

    it('falls back to first Saturday when not provided', () => {
      const result = getFirstGameweekStart(seasonStart);
      expect(result.getDate()).toBe(4); // Saturday April 4
      expect(result.getDay()).toBe(6);
    });
  });

  describe('getWeekStart with firstGameweekStart', () => {
    it('returns Friday Apr 3 for a date on Friday Apr 3', () => {
      const result = getWeekStart(new Date(2026, 3, 3, 10, 0), firstGW);
      expect(result.getDate()).toBe(3);
      expect(result.getDay()).toBe(5); // Friday
    });

    it('returns Friday Apr 3 for a date on Wednesday Apr 8 (mid-GW1)', () => {
      const result = getWeekStart(new Date(2026, 3, 8), firstGW);
      expect(result.getDate()).toBe(3); // Still in GW1
    });

    it('returns Friday Apr 3 for a date on Friday Apr 10 (last day of GW1)', () => {
      const result = getWeekStart(new Date(2026, 3, 10, 23, 0), firstGW);
      expect(result.getDate()).toBe(3);
    });

    it('returns Saturday Apr 11 for a date on Saturday Apr 11 (GW2)', () => {
      const result = getWeekStart(new Date(2026, 3, 11), firstGW);
      expect(result.getDate()).toBe(11);
      expect(result.getDay()).toBe(6); // Saturday
    });

    it('returns Saturday Apr 18 for a date in GW3', () => {
      const result = getWeekStart(new Date(2026, 3, 20), firstGW); // Monday Apr 20
      expect(result.getDate()).toBe(18);
      expect(result.getDay()).toBe(6);
    });

    it('uses normal Saturday logic for dates before GW1', () => {
      const result = getWeekStart(new Date(2026, 2, 30), firstGW); // March 30 (Monday)
      expect(result.getDay()).toBe(6); // Previous Saturday (Mar 28)
      expect(result.getDate()).toBe(28);
    });
  });

  describe('getWeekEnd with firstGameweekStart', () => {
    it('returns Friday Apr 10 23:59:59.999 for GW1', () => {
      const gw1Start = new Date(2026, 3, 3);
      gw1Start.setHours(0, 0, 0, 0);
      const result = getWeekEnd(gw1Start, firstGW);
      expect(result.getDate()).toBe(10); // Friday Apr 10
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });

    it('returns normal 7-day end for GW2', () => {
      const gw2Start = new Date(2026, 3, 11);
      gw2Start.setHours(0, 0, 0, 0);
      const result = getWeekEnd(gw2Start, firstGW);
      expect(result.getDate()).toBe(17); // Friday Apr 17
    });
  });

  describe('getGameweekNumber with firstGameweekStart', () => {
    it('returns GW1 for Friday Apr 3', () => {
      const fri = new Date(2026, 3, 3);
      fri.setHours(0, 0, 0, 0);
      expect(getGameweekNumber(fri, seasonStart, firstGW)).toBe(1);
    });

    it('returns GW2 for Saturday Apr 11', () => {
      const sat = new Date(2026, 3, 11);
      sat.setHours(0, 0, 0, 0);
      expect(getGameweekNumber(sat, seasonStart, firstGW)).toBe(2);
    });

    it('returns GW3 for Saturday Apr 18', () => {
      const sat = new Date(2026, 3, 18);
      sat.setHours(0, 0, 0, 0);
      expect(getGameweekNumber(sat, seasonStart, firstGW)).toBe(3);
    });
  });

  describe('getNextWeekStart with firstGameweekStart', () => {
    it('returns GW2 start (Sat Apr 11 8am) when inside GW1', () => {
      const result = getNextWeekStart(new Date(2026, 3, 5), firstGW); // Sunday Apr 5, inside GW1
      expect(result.getDate()).toBe(11);
      expect(result.getDay()).toBe(6);
      expect(result.getHours()).toBe(8);
    });

    it('returns normal next Saturday for GW2+', () => {
      const result = getNextWeekStart(new Date(2026, 3, 13), firstGW); // Monday Apr 13, GW2
      expect(result.getDate()).toBe(18);
      expect(result.getDay()).toBe(6);
      expect(result.getHours()).toBe(8);
    });
  });

  describe('getTeamEffectiveStartDate with firstGameweekStart', () => {
    it('returns GW2 start for team created during GW1', () => {
      const result = getTeamEffectiveStartDate(new Date(2026, 3, 5), firstGW);
      expect(result.getDate()).toBe(11); // Sat Apr 11
      expect(result.getHours()).toBe(8);
    });

    it('returns GW1 start for team created before GW1 kickoff', () => {
      // Team created April 1 (Wed), GW1 starts April 3 (Fri)
      // Should earn points from GW1, not GW2
      const result = getTeamEffectiveStartDate(new Date(2026, 3, 1), firstGW);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(3); // Apr 3 (GW1 start)
      expect(result.getHours()).toBe(0);
    });

    it('returns GW1 start for team created in the week before GW1', () => {
      // Team created March 30 (Mon), GW1 starts April 3 (Fri)
      const result = getTeamEffectiveStartDate(new Date(2026, 2, 30), firstGW);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(3); // Apr 3 (GW1 start)
      expect(result.getHours()).toBe(0);
    });

    it('returns GW1 start for team created well before GW1', () => {
      // Team created March 1, GW1 starts April 3
      const result = getTeamEffectiveStartDate(new Date(2026, 2, 1), firstGW);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(3); // GW1 start
    });
  });
});

describe('hasUnlimitedTransfers', () => {
  // Season: startDate Mar 1, firstGameweekStart Apr 3 (Fri 8am)
  const seasonStart = new Date('2026-03-01T00:00:00Z');
  const firstGW = new Date('2026-04-03T08:00:00Z');

  it('returns true before season startDate (pre-season)', () => {
    const now = new Date('2026-02-15T12:00:00Z');
    expect(hasUnlimitedTransfers(seasonStart, firstGW, undefined, now)).toBe(true);
  });

  it('returns true between season startDate and firstGameweekStart', () => {
    const now = new Date('2026-04-01T12:00:00Z');
    // Team created March 15 — effective start is past
    const teamCreated = new Date('2026-03-15T00:00:00Z');
    expect(hasUnlimitedTransfers(seasonStart, firstGW, teamCreated, now)).toBe(true);
  });

  it('returns false after firstGameweekStart with old team', () => {
    const now = new Date('2026-04-05T12:00:00Z');
    const teamCreated = new Date('2026-03-01T00:00:00Z');
    expect(hasUnlimitedTransfers(seasonStart, firstGW, teamCreated, now)).toBe(false);
  });

  it('returns true for newly created team (before effective start)', () => {
    // Team created mid-season on a Wednesday — effective start is next Saturday 8am
    const now = new Date('2026-04-08T12:00:00Z'); // Wednesday after GW1
    const teamCreated = new Date('2026-04-08T10:00:00Z'); // Just created
    expect(hasUnlimitedTransfers(seasonStart, firstGW, teamCreated, now)).toBe(true);
  });

  it('returns true when no teamCreatedAt (no team yet) and before GW1', () => {
    const now = new Date('2026-04-01T12:00:00Z');
    expect(hasUnlimitedTransfers(seasonStart, firstGW, undefined, now)).toBe(true);
  });

  it('returns false when no teamCreatedAt and after GW1', () => {
    const now = new Date('2026-04-05T12:00:00Z');
    expect(hasUnlimitedTransfers(seasonStart, firstGW, undefined, now)).toBe(false);
  });

  it('returns false when no season data', () => {
    const now = new Date('2026-04-01T12:00:00Z');
    expect(hasUnlimitedTransfers(null, null, undefined, now)).toBe(false);
  });

  it('returns true on GW1 day before configured kickoff time (e.g. 07:00 < 08:00)', () => {
    const now = new Date('2026-04-03T07:00:00Z'); // 7am on GW1 day, kickoff is 8am
    expect(hasUnlimitedTransfers(seasonStart, firstGW, undefined, now)).toBe(true);
  });

  it('returns false on GW1 day after configured kickoff time (e.g. 09:00 > 08:00)', () => {
    const now = new Date('2026-04-03T09:00:00Z'); // 9am on GW1 day, kickoff was 8am
    expect(hasUnlimitedTransfers(seasonStart, firstGW, undefined, now)).toBe(false);
  });
});

describe('getTransferDeadline', () => {
  it('returns 07:00 UTC for a BST Saturday (summer)', () => {
    // Saturday July 4, 2026 — BST (UTC+1), so 8am UK = 7am UTC
    const sat = new Date(Date.UTC(2026, 6, 4, 0, 0, 0));
    const deadline = getTransferDeadline(sat);
    expect(deadline.getUTCHours()).toBe(7);
    expect(deadline.getUTCDate()).toBe(4);
  });

  it('returns 08:00 UTC for a GMT Saturday (winter)', () => {
    // Saturday January 10, 2026 — GMT (UTC+0), so 8am UK = 8am UTC
    const sat = new Date(Date.UTC(2026, 0, 10, 0, 0, 0));
    const deadline = getTransferDeadline(sat);
    expect(deadline.getUTCHours()).toBe(8);
    expect(deadline.getUTCDate()).toBe(10);
  });

  it('returns 07:00 UTC just after BST starts (late March)', () => {
    // Saturday March 28, 2026 — just after clocks go forward (BST starts March 29)
    // March 28 is still GMT, so 8am UK = 8am UTC
    const sat = new Date(Date.UTC(2026, 2, 28, 0, 0, 0));
    const deadline = getTransferDeadline(sat);
    expect(deadline.getUTCHours()).toBe(8);
  });

  it('returns 07:00 UTC for first Saturday after BST starts', () => {
    // Saturday April 4, 2026 — BST is active, so 8am UK = 7am UTC
    const sat = new Date(Date.UTC(2026, 3, 4, 0, 0, 0));
    const deadline = getTransferDeadline(sat);
    expect(deadline.getUTCHours()).toBe(7);
  });

  it('returns 08:00 UTC just after GMT starts (late October)', () => {
    // Saturday October 31, 2026 — clocks go back (GMT starts Oct 25)
    // October 31 is GMT, so 8am UK = 8am UTC
    const sat = new Date(Date.UTC(2026, 9, 31, 0, 0, 0));
    const deadline = getTransferDeadline(sat);
    expect(deadline.getUTCHours()).toBe(8);
  });

  it('returns 07:00 UTC for last Saturday before GMT starts', () => {
    // Saturday October 24, 2026 — still BST, so 8am UK = 7am UTC
    const sat = new Date(Date.UTC(2026, 9, 24, 0, 0, 0));
    const deadline = getTransferDeadline(sat);
    expect(deadline.getUTCHours()).toBe(7);
  });
});
