import { registerSchema, loginSchema, verifyPhoneSchema } from './auth.validator';

describe('auth.validator re-exports', () => {
  it('exports registerSchema', () => {
    expect(registerSchema).toBeDefined();
    expect(typeof registerSchema.parse).toBe('function');
  });

  it('exports loginSchema', () => {
    expect(loginSchema).toBeDefined();
    expect(typeof loginSchema.parse).toBe('function');
  });

  it('exports verifyPhoneSchema', () => {
    expect(verifyPhoneSchema).toBeDefined();
    expect(typeof verifyPhoneSchema.parse).toBe('function');
  });
});
