// Auth validation schemas (Zod)

import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PHONE_NUMBER_REGEX,
  VERIFICATION_CODE_LENGTH,
} from '../constants/rules';

export const phoneNumberSchema = z
  .string()
  .regex(PHONE_NUMBER_REGEX, 'Must be a valid UK mobile number (+447 followed by 9 digits)');

export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  username: z
    .string()
    .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
    .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters`)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`),
  phoneNumber: phoneNumberSchema,
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyPhoneSchema = z.object({
  code: z
    .string()
    .length(VERIFICATION_CODE_LENGTH, `Code must be ${VERIFICATION_CODE_LENGTH} digits`)
    .regex(/^\d+$/, 'Code must contain only digits'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyPhoneInput = z.infer<typeof verifyPhoneSchema>;
