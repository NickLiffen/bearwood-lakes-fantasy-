// Picks validation schemas (Zod)

import { z } from 'zod';
import { MAX_PLAYERS, MIN_PLAYERS, BUDGET_CAP } from '../constants/rules';

export const savePicksSchema = z.object({
  playerIds: z
    .array(z.string())
    .min(MIN_PLAYERS, `You must select exactly ${MIN_PLAYERS} players`)
    .max(MAX_PLAYERS, `You must select exactly ${MAX_PLAYERS} players`)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate players are not allowed'),
});

export type SavePicksInput = z.infer<typeof savePicksSchema>;

// Helper to validate budget (requires player prices, done at service level)
export const validateBudget = (totalSpent: number): boolean => {
  return totalSpent <= BUDGET_CAP;
};
