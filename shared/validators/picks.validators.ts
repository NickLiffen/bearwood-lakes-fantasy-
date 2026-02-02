// Picks validation schemas (Zod)

import { z } from 'zod';
import { MAX_PLAYERS, MIN_PLAYERS, BUDGET_CAP } from '../constants/rules';

export const savePicksSchema = z.object({
  golferIds: z
    .array(z.string())
    .min(MIN_PLAYERS, `You must select exactly ${MIN_PLAYERS} golfers`)
    .max(MAX_PLAYERS, `You must select exactly ${MAX_PLAYERS} golfers`)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate golfers are not allowed'),
  captainId: z.string().nullable().optional(),
});

export type SavePicksInput = z.infer<typeof savePicksSchema>;

// Helper to validate budget (requires golfer prices, done at service level)
export const validateBudget = (totalSpent: number): boolean => {
  return totalSpent <= BUDGET_CAP;
};
