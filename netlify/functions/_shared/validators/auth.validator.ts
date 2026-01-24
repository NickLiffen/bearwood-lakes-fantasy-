// Auth validation for functions

import { z } from 'zod';
import { registerSchema, loginSchema } from '../../../../shared/validators/auth.validators';

export { registerSchema, loginSchema };

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
