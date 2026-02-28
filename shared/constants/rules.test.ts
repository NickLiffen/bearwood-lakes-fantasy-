import {
  BUDGET_CAP,
  MAX_GOLFERS,
  MIN_GOLFERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROLES,
  PASSWORD_MIN_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PHONE_NUMBER_REGEX,
  VERIFICATION_CODE_LENGTH,
  POSITION_POINTS,
  STABLEFORD_THRESHOLDS,
  MEDAL_THRESHOLDS,
  BONUS_POINTS,
} from './rules';

describe('team size constants', () => {
  it('BUDGET_CAP is $50M', () => {
    expect(BUDGET_CAP).toBe(50_000_000);
  });

  it('MAX_GOLFERS and MIN_GOLFERS are both 6', () => {
    expect(MAX_GOLFERS).toBe(6);
    expect(MIN_GOLFERS).toBe(6);
  });

  it('MAX_PLAYERS and MIN_PLAYERS are aliases', () => {
    expect(MAX_PLAYERS).toBe(MAX_GOLFERS);
    expect(MIN_PLAYERS).toBe(MIN_GOLFERS);
  });
});

describe('ROLES', () => {
  it('has ADMIN and USER', () => {
    expect(ROLES.ADMIN).toBe('admin');
    expect(ROLES.USER).toBe('user');
  });

  it('has exactly 2 roles', () => {
    expect(Object.keys(ROLES)).toHaveLength(2);
  });
});

describe('auth constants', () => {
  it('PASSWORD_MIN_LENGTH is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it('USERNAME_MIN_LENGTH is 3', () => {
    expect(USERNAME_MIN_LENGTH).toBe(3);
  });

  it('USERNAME_MAX_LENGTH is 20', () => {
    expect(USERNAME_MAX_LENGTH).toBe(20);
  });

  it('VERIFICATION_CODE_LENGTH is 6', () => {
    expect(VERIFICATION_CODE_LENGTH).toBe(6);
  });
});

describe('PHONE_NUMBER_REGEX', () => {
  it('matches a valid UK mobile number', () => {
    expect(PHONE_NUMBER_REGEX.test('+447900165650')).toBe(true);
  });

  it('matches another valid UK mobile', () => {
    expect(PHONE_NUMBER_REGEX.test('+447123456789')).toBe(true);
  });

  it('rejects a short number', () => {
    expect(PHONE_NUMBER_REGEX.test('+447')).toBe(false);
  });

  it('rejects a number that is too long', () => {
    expect(PHONE_NUMBER_REGEX.test('+44790016565099')).toBe(false);
  });

  it('rejects a plain digit string', () => {
    expect(PHONE_NUMBER_REGEX.test('12345')).toBe(false);
  });

  it('rejects missing + prefix', () => {
    expect(PHONE_NUMBER_REGEX.test('447900165650')).toBe(false);
  });

  it('rejects non-7 after +44', () => {
    expect(PHONE_NUMBER_REGEX.test('+448900165650')).toBe(false);
  });

  it('rejects letters in the number', () => {
    expect(PHONE_NUMBER_REGEX.test('+447abcdefghi')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(PHONE_NUMBER_REGEX.test('')).toBe(false);
  });
});

describe('scoring constants', () => {
  it('POSITION_POINTS maps 1st/2nd/3rd correctly', () => {
    expect(POSITION_POINTS[1]).toBe(10);
    expect(POSITION_POINTS[2]).toBe(7);
    expect(POSITION_POINTS[3]).toBe(5);
  });

  it('POSITION_POINTS has exactly 3 entries', () => {
    expect(Object.keys(POSITION_POINTS)).toHaveLength(3);
  });

  it('STABLEFORD_THRESHOLDS has HIGH=36 and LOW=32', () => {
    expect(STABLEFORD_THRESHOLDS.HIGH).toBe(36);
    expect(STABLEFORD_THRESHOLDS.LOW).toBe(32);
  });

  it('MEDAL_THRESHOLDS has HIGH=72 and LOW=76', () => {
    expect(MEDAL_THRESHOLDS.HIGH).toBe(72);
    expect(MEDAL_THRESHOLDS.LOW).toBe(76);
  });

  it('BONUS_POINTS has HIGH=3 and LOW=1', () => {
    expect(BONUS_POINTS.HIGH).toBe(3);
    expect(BONUS_POINTS.LOW).toBe(1);
  });
});
