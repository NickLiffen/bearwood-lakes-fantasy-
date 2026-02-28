import {
  formatCurrency,
  formatPrice,
  formatDate,
  formatDateTime,
  formatPlayerName,
  formatRawScore,
  getInitials,
} from './formatters';

describe('formatCurrency', () => {
  it('formats a positive amount as GBP with no decimals', () => {
    expect(formatCurrency(5000000)).toBe('£5,000,000');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('£0');
  });

  it('formats a small amount', () => {
    expect(formatCurrency(100)).toBe('£100');
  });

  it('formats a negative amount', () => {
    expect(formatCurrency(-1500)).toBe('-£1,500');
  });
});

describe('formatPrice', () => {
  it('formats price in millions', () => {
    expect(formatPrice(5500000)).toBe('$5.5M');
  });

  it('formats a round million', () => {
    expect(formatPrice(10000000)).toBe('$10.0M');
  });

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('$0.0M');
  });

  it('formats sub-million price', () => {
    expect(formatPrice(500000)).toBe('$0.5M');
  });

  it('formats a very small price', () => {
    expect(formatPrice(100000)).toBe('$0.1M');
  });
});

describe('formatDate', () => {
  it('formats a Date object', () => {
    const result = formatDate(new Date(2026, 0, 15));
    expect(result).toBe('15 Jan 2026');
  });

  it('formats an ISO string', () => {
    const result = formatDate('2026-06-01T12:00:00Z');
    expect(result).toMatch(/1 Jun 2026/);
  });
});

describe('formatDateTime', () => {
  it('includes time in the output', () => {
    const result = formatDateTime(new Date(2026, 5, 15, 14, 30));
    expect(result).toContain('15');
    expect(result).toContain('Jun');
    expect(result).toContain('2026');
    expect(result).toMatch(/14:30/);
  });

  it('accepts a string date', () => {
    const result = formatDateTime('2026-01-01T09:05:00');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
  });
});

describe('formatPlayerName', () => {
  it('joins first and last name', () => {
    expect(formatPlayerName('Rory', 'McIlroy')).toBe('Rory McIlroy');
  });

  it('handles empty first name', () => {
    expect(formatPlayerName('', 'Woods')).toBe(' Woods');
  });

  it('handles empty last name', () => {
    expect(formatPlayerName('Tiger', '')).toBe('Tiger ');
  });

  it('handles both empty', () => {
    expect(formatPlayerName('', '')).toBe(' ');
  });
});

describe('formatRawScore', () => {
  it('returns dash for null score', () => {
    expect(formatRawScore(null, 'medal')).toBe('-');
    expect(formatRawScore(null, 'stableford')).toBe('-');
  });

  it('returns dash for undefined score', () => {
    expect(formatRawScore(undefined as unknown as null, 'medal')).toBe('-');
  });

  it('formats positive medal score with plus', () => {
    expect(formatRawScore(3, 'medal')).toBe('+3');
  });

  it('formats negative medal score as-is', () => {
    expect(formatRawScore(-2, 'medal')).toBe('-2');
  });

  it('formats zero medal score as 0 (no plus)', () => {
    expect(formatRawScore(0, 'medal')).toBe('0');
  });

  it('formats stableford score as plain number', () => {
    expect(formatRawScore(36, 'stableford')).toBe('36');
  });

  it('formats stableford zero as 0', () => {
    expect(formatRawScore(0, 'stableford')).toBe('0');
  });

  it('formats negative stableford as-is', () => {
    expect(formatRawScore(-1, 'stableford')).toBe('-1');
  });
});

describe('getInitials', () => {
  it('returns uppercase initials', () => {
    expect(getInitials('Rory', 'McIlroy')).toBe('RM');
  });

  it('handles lowercase names', () => {
    expect(getInitials('tiger', 'woods')).toBe('TW');
  });

  it('handles empty first name gracefully', () => {
    expect(getInitials('', 'Woods')).toBe('W');
  });

  it('handles empty last name gracefully', () => {
    expect(getInitials('Tiger', '')).toBe('T');
  });

  it('handles single char names', () => {
    expect(getInitials('A', 'B')).toBe('AB');
  });
});
