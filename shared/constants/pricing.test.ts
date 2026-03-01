import {
  MIN_PRICE,
  MAX_PRICE,
  PRICE_RANGE,
  POWER_EXPONENT,
  ROUND_TO,
  MEAN_AVG_PTS,
  MIN_SAMPLE_SIZE,
  calculatePrice,
} from './pricing';

describe('pricing constants', () => {
  it('MIN_PRICE is £3.5M', () => {
    expect(MIN_PRICE).toBe(3_500_000);
  });

  it('MAX_PRICE is £14.5M', () => {
    expect(MAX_PRICE).toBe(14_500_000);
  });

  it('PRICE_RANGE equals MAX_PRICE - MIN_PRICE', () => {
    expect(PRICE_RANGE).toBe(MAX_PRICE - MIN_PRICE);
  });

  it('POWER_EXPONENT is 1.3 (convex curve)', () => {
    expect(POWER_EXPONENT).toBe(1.3);
  });

  it('ROUND_TO is 100K', () => {
    expect(ROUND_TO).toBe(100_000);
  });

  it('MEAN_AVG_PTS is 3', () => {
    expect(MEAN_AVG_PTS).toBe(3);
  });

  it('MIN_SAMPLE_SIZE is 5', () => {
    expect(MIN_SAMPLE_SIZE).toBe(5);
  });
});

describe('calculatePrice', () => {
  it('returns MIN_PRICE for normalized score 0', () => {
    expect(calculatePrice(0)).toBe(MIN_PRICE);
  });

  it('returns MAX_PRICE for normalized score 1', () => {
    expect(calculatePrice(1)).toBe(MAX_PRICE);
  });

  it('clamps negative scores to MIN_PRICE', () => {
    expect(calculatePrice(-0.5)).toBe(MIN_PRICE);
  });

  it('clamps scores above 1 to MAX_PRICE', () => {
    expect(calculatePrice(1.5)).toBe(MAX_PRICE);
  });

  it('returns a price between MIN and MAX for score 0.5', () => {
    const price = calculatePrice(0.5);
    expect(price).toBeGreaterThan(MIN_PRICE);
    expect(price).toBeLessThan(MAX_PRICE);
  });

  it('rounds to nearest ROUND_TO', () => {
    const price = calculatePrice(0.5);
    expect(price % ROUND_TO).toBe(0);
  });

  it('produces known regression values', () => {
    // 0.5^1.3 ≈ 0.406 → 3.5M + 0.406 × 11M ≈ 7.97M → rounds to 8.0M
    expect(calculatePrice(0.5)).toBe(8_000_000);
    // 0.9^1.3 ≈ 0.872 → 3.5M + 0.872 × 11M ≈ 13.09M → rounds to 13.1M
    expect(calculatePrice(0.9)).toBe(13_100_000);
  });

  describe('ranking preservation (monotonicity)', () => {
    it('preserves ordering: ascending input → ascending output', () => {
      const inputs = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      const outputs = inputs.map(calculatePrice);

      for (let i = 1; i < outputs.length; i++) {
        expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]);
      }
    });

    it('equal inputs produce equal outputs', () => {
      expect(calculatePrice(0.5)).toBe(calculatePrice(0.5));
      expect(calculatePrice(0.75)).toBe(calculatePrice(0.75));
    });

    it('preserves ordering for fine-grained inputs', () => {
      const inputs = Array.from({ length: 100 }, (_, i) => i / 99);
      const outputs = inputs.map(calculatePrice);

      for (let i = 1; i < outputs.length; i++) {
        expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]);
      }
    });

    it('all outputs are within [MIN_PRICE, MAX_PRICE]', () => {
      const inputs = Array.from({ length: 101 }, (_, i) => i / 100);
      const outputs = inputs.map(calculatePrice);

      for (const price of outputs) {
        expect(price).toBeGreaterThanOrEqual(MIN_PRICE);
        expect(price).toBeLessThanOrEqual(MAX_PRICE);
      }
    });
  });
});
