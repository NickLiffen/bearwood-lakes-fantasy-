// Pricing algorithm constants and helpers

/** Minimum golfer price (£3.5M) */
export const MIN_PRICE = 3_500_000;

/** Maximum golfer price (£14.5M) */
export const MAX_PRICE = 14_500_000;

/** Price range above the floor */
export const PRICE_RANGE = MAX_PRICE - MIN_PRICE; // £11M

/** Convex power curve exponent — values > 1 inflate top-end prices */
export const POWER_EXPONENT = 1.3;

/** Round prices to nearest £100K */
export const ROUND_TO = 100_000;

/** League average points per event (for small-sample dampening) */
export const MEAN_AVG_PTS = 3;

/** Minimum games before trusting raw average */
export const MIN_SAMPLE_SIZE = 5;

/**
 * Calculate a golfer price from a normalized score (0–1).
 * Applies the convex power curve and clamps to [MIN_PRICE, MAX_PRICE].
 */
export function calculatePrice(normalizedScore: number): number {
  const clamped = Math.max(0, Math.min(1, normalizedScore));
  const priceFactor = Math.pow(clamped, POWER_EXPONENT);
  const rawPrice = MIN_PRICE + priceFactor * PRICE_RANGE;
  const rounded = Math.round(rawPrice / ROUND_TO) * ROUND_TO;
  return Math.min(Math.max(rounded, MIN_PRICE), MAX_PRICE);
}
