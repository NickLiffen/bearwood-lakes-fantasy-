import { savePicksSchema, BUDGET_CAP, MAX_PLAYERS } from './picks.validator';

describe('picks.validator re-exports', () => {
  it('exports savePicksSchema', () => {
    expect(savePicksSchema).toBeDefined();
    expect(typeof savePicksSchema.parse).toBe('function');
  });

  it('exports BUDGET_CAP as a number', () => {
    expect(typeof BUDGET_CAP).toBe('number');
    expect(BUDGET_CAP).toBeGreaterThan(0);
  });

  it('exports MAX_PLAYERS as a number', () => {
    expect(typeof MAX_PLAYERS).toBe('number');
    expect(MAX_PLAYERS).toBeGreaterThan(0);
  });
});
