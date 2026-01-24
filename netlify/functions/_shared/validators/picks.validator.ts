// Picks validation for functions

import { z } from 'zod';
import { savePicksSchema } from '../../../../shared/validators/picks.validators';
import { BUDGET_CAP, MAX_PLAYERS } from '../../../../shared/constants/rules';

export { savePicksSchema, BUDGET_CAP, MAX_PLAYERS };

/**
 * Validate request body against schema
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: string | null): T {
  if (!body) {
    throw new Error('Request body is required');
  }
  const parsed = JSON.parse(body);
  return schema.parse(parsed);
}
