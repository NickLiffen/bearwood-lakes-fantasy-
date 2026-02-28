import { savePicksSchema, validateBudget } from './picks.validators';

const sixUniqueIds = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];

describe('savePicksSchema', () => {
  it('accepts exactly 6 unique golfer IDs', () => {
    const result = savePicksSchema.safeParse({ golferIds: sixUniqueIds });
    expect(result.success).toBe(true);
  });

  it('accepts with optional captainId', () => {
    const result = savePicksSchema.safeParse({ golferIds: sixUniqueIds, captainId: 'g1' });
    expect(result.success).toBe(true);
  });

  it('accepts with captainId set to null', () => {
    const result = savePicksSchema.safeParse({ golferIds: sixUniqueIds, captainId: null });
    expect(result.success).toBe(true);
  });

  it('accepts without captainId field', () => {
    const result = savePicksSchema.safeParse({ golferIds: sixUniqueIds });
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 6 golfers', () => {
    const result = savePicksSchema.safeParse({ golferIds: ['g1', 'g2', 'g3', 'g4', 'g5'] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 6 golfers', () => {
    const result = savePicksSchema.safeParse({
      golferIds: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty golferIds array', () => {
    const result = savePicksSchema.safeParse({ golferIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate golfer IDs', () => {
    const result = savePicksSchema.safeParse({
      golferIds: ['g1', 'g1', 'g2', 'g3', 'g4', 'g5'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects all-duplicate golfer IDs', () => {
    const result = savePicksSchema.safeParse({
      golferIds: ['g1', 'g1', 'g1', 'g1', 'g1', 'g1'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing golferIds field', () => {
    const result = savePicksSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-string golfer IDs', () => {
    const result = savePicksSchema.safeParse({ golferIds: [1, 2, 3, 4, 5, 6] });
    expect(result.success).toBe(false);
  });
});

describe('validateBudget', () => {
  it('returns true when totalSpent equals BUDGET_CAP', () => {
    expect(validateBudget(50_000_000)).toBe(true);
  });

  it('returns true when totalSpent is under BUDGET_CAP', () => {
    expect(validateBudget(49_999_999)).toBe(true);
    expect(validateBudget(0)).toBe(true);
  });

  it('returns false when totalSpent exceeds BUDGET_CAP', () => {
    expect(validateBudget(50_000_001)).toBe(false);
  });

  it('returns false for a very large number', () => {
    expect(validateBudget(100_000_000)).toBe(false);
  });

  it('returns true for negative totalSpent', () => {
    expect(validateBudget(-1)).toBe(true);
  });
});
