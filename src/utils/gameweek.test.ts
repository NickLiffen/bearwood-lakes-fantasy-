import {
  getSaturdayOfWeek,
  getSeasonFirstSaturday,
  getGameweekNumber,
  formatDateString,
  formatWeekLabel,
  generateWeekOptions,
  generateMonthOptions,
} from './gameweek';

describe('getSaturdayOfWeek', () => {
  it('returns same day for a Saturday', () => {
    // April 4, 2026 is a Saturday
    const sat = new Date(2026, 3, 4, 15, 30);
    const result = getSaturdayOfWeek(sat);
    expect(result.getDay()).toBe(6); // Saturday
    expect(result.getDate()).toBe(4);
    expect(result.getHours()).toBe(0);
  });

  it('returns previous Saturday for a Sunday', () => {
    // April 5, 2026 is a Sunday
    const sun = new Date(2026, 3, 5);
    const result = getSaturdayOfWeek(sun);
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4); // back to April 4
  });

  it('returns previous Saturday for a Wednesday', () => {
    // April 8, 2026 is a Wednesday
    const wed = new Date(2026, 3, 8);
    const result = getSaturdayOfWeek(wed);
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4); // back to April 4
  });

  it('returns previous Saturday for a Friday', () => {
    // April 10, 2026 is a Friday
    const fri = new Date(2026, 3, 10);
    const result = getSaturdayOfWeek(fri);
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4);
  });

  it('returns previous Saturday for a Monday', () => {
    // April 6, 2026 is a Monday
    const mon = new Date(2026, 3, 6);
    const result = getSaturdayOfWeek(mon);
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4);
  });

  it('zeroes out the time', () => {
    const d = new Date(2026, 3, 4, 23, 59, 59);
    const result = getSaturdayOfWeek(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe('getSeasonFirstSaturday', () => {
  it('returns same date if already Saturday', () => {
    // April 4, 2026 is a Saturday
    const result = getSeasonFirstSaturday(new Date(2026, 3, 4));
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4);
  });

  it('advances to next Saturday if given a Wednesday', () => {
    // April 1, 2026 is a Wednesday — next Saturday is April 4
    const result = getSeasonFirstSaturday(new Date(2026, 3, 1));
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(4);
    expect(result.getMonth()).toBe(3); // April
  });

  it('advances to next Saturday if given a Sunday', () => {
    // April 5, 2026 is a Sunday — next Saturday is April 11
    const result = getSeasonFirstSaturday(new Date(2026, 3, 5));
    expect(result.getDay()).toBe(6);
    expect(result.getDate()).toBe(11);
  });

  it('zeroes out time', () => {
    const result = getSeasonFirstSaturday(new Date(2026, 3, 1, 14, 30));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });
});

describe('getGameweekNumber', () => {
  // Season starts April 1, 2026 (Wednesday) → first Saturday = April 4
  const seasonStart = new Date(2026, 3, 1);

  it('returns GW1 for the first Saturday', () => {
    const firstSat = new Date(2026, 3, 4);
    expect(getGameweekNumber(firstSat, seasonStart)).toBe(1);
  });

  it('returns GW2 for the second Saturday', () => {
    const secondSat = new Date(2026, 3, 11);
    expect(getGameweekNumber(secondSat, seasonStart)).toBe(2);
  });

  it('returns GW5 for 4 weeks later', () => {
    const fifthSat = new Date(2026, 4, 2); // May 2, 2026
    expect(getGameweekNumber(fifthSat, seasonStart)).toBe(5);
  });

  it('returns 0 or negative for a date before the first Saturday', () => {
    const before = new Date(2026, 2, 28); // March 28
    expect(getGameweekNumber(before, seasonStart)).toBeLessThan(1);
  });
});

describe('formatDateString', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(formatDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('zero-pads month and day', () => {
    expect(formatDateString(new Date(2026, 3, 4))).toBe('2026-04-04');
  });

  it('handles December', () => {
    expect(formatDateString(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('formatWeekLabel', () => {
  it('includes gameweek number when provided', () => {
    const sat = new Date(2026, 3, 4);
    const result = formatWeekLabel(sat, 1);
    expect(result).toContain('Gameweek 1');
    expect(result).toContain('2026');
  });

  it('returns just the date when no gameweek', () => {
    const sat = new Date(2026, 3, 4);
    const result = formatWeekLabel(sat);
    expect(result).not.toContain('Gameweek');
    expect(result).toContain('2026');
  });

  it('returns just the date when gameweek is null', () => {
    const result = formatWeekLabel(new Date(2026, 3, 4), null);
    expect(result).not.toContain('Gameweek');
  });

  it('returns just the date when gameweek is 0', () => {
    const result = formatWeekLabel(new Date(2026, 3, 4), 0);
    expect(result).not.toContain('Gameweek');
  });
});

describe('generateWeekOptions', () => {
  it('returns at least one option', () => {
    const options = generateWeekOptions('2020-01-01');
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  it('includes gameweek labels when seasonStartDate is provided', () => {
    // Use a season start far in the past to guarantee options
    const options = generateWeekOptions('2024-01-01', '2024-01-01');
    expect(options.length).toBeGreaterThan(0);
    // Most recent first — first option should have a Gameweek label
    expect(options[0].label).toContain('Gameweek');
  });

  it('each option has a YYYY-MM-DD value', () => {
    const options = generateWeekOptions('2024-06-01', '2024-06-01');
    for (const opt of options) {
      expect(opt.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns options without gameweek when no seasonStartDate', () => {
    const options = generateWeekOptions('2024-01-01');
    expect(options.length).toBeGreaterThan(0);
    // Without season start, labels should not contain "Gameweek"
    expect(options[0].label).not.toContain('Gameweek');
  });
});

describe('generateMonthOptions', () => {
  it('returns months from season start to now', () => {
    const options = generateMonthOptions('2024-01-01');
    expect(options.length).toBeGreaterThan(0);
  });

  it('most recent month is first', () => {
    const options = generateMonthOptions('2024-01-01');
    // First label should contain the current year or a recent year
    expect(options[0].label).toMatch(/\d{4}/);
  });

  it('each option has YYYY-MM-01 value', () => {
    const options = generateMonthOptions('2024-06-01');
    for (const opt of options) {
      expect(opt.value).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });

  it('handles future season start (pre-season)', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const options = generateMonthOptions(futureDate.toISOString());
    // Should still return at least one option (the start month)
    expect(options.length).toBeGreaterThanOrEqual(1);
  });
});
