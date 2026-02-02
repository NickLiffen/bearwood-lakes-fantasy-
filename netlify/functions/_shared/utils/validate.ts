// Shared validation utilities for functions

import { z } from 'zod';

/**
 * Validate and parse request body against a Zod schema
 * @throws Error if body is missing or validation fails
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: string | null): T {
  if (!body) {
    throw new Error('Request body is required');
  }
  const parsed = JSON.parse(body);
  return schema.parse(parsed);
}

/**
 * Validate and parse request body, returning a result object instead of throwing
 */
export function validateBodySafe<T>(
  schema: z.ZodSchema<T>,
  body: string | null
): { success: true; data: T } | { success: false; error: string } {
  if (!body) {
    return { success: false, error: 'Request body is required' };
  }
  try {
    const parsed = JSON.parse(body);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error.message };
  } catch {
    return { success: false, error: 'Invalid JSON body' };
  }
}
