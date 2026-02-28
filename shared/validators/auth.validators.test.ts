import { registerSchema, loginSchema, verifyPhoneSchema } from './auth.validators';

const validRegistration = {
  firstName: 'Nick',
  lastName: 'Liffen',
  username: 'nick_liffen',
  email: 'nick@example.com',
  password: 'securepass',
  phoneNumber: '+447900165650',
};

describe('registerSchema', () => {
  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse(validRegistration);
    expect(result.success).toBe(true);
  });

  describe('firstName', () => {
    it('rejects empty firstName', () => {
      const result = registerSchema.safeParse({ ...validRegistration, firstName: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('lastName', () => {
    it('rejects empty lastName', () => {
      const result = registerSchema.safeParse({ ...validRegistration, lastName: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('username', () => {
    it('rejects username shorter than 3 chars', () => {
      const result = registerSchema.safeParse({ ...validRegistration, username: 'ab' });
      expect(result.success).toBe(false);
    });

    it('accepts username of exactly 3 chars', () => {
      const result = registerSchema.safeParse({ ...validRegistration, username: 'abc' });
      expect(result.success).toBe(true);
    });

    it('accepts username of exactly 20 chars', () => {
      const result = registerSchema.safeParse({
        ...validRegistration,
        username: 'a'.repeat(20),
      });
      expect(result.success).toBe(true);
    });

    it('rejects username longer than 20 chars', () => {
      const result = registerSchema.safeParse({
        ...validRegistration,
        username: 'a'.repeat(21),
      });
      expect(result.success).toBe(false);
    });

    it('rejects username with special characters', () => {
      const result = registerSchema.safeParse({ ...validRegistration, username: 'nick@liffen' });
      expect(result.success).toBe(false);
    });

    it('rejects username with spaces', () => {
      const result = registerSchema.safeParse({ ...validRegistration, username: 'nick liffen' });
      expect(result.success).toBe(false);
    });

    it('accepts username with underscores', () => {
      const result = registerSchema.safeParse({ ...validRegistration, username: 'nick_l_1' });
      expect(result.success).toBe(true);
    });

    it('accepts username with numbers', () => {
      const result = registerSchema.safeParse({ ...validRegistration, username: 'nick123' });
      expect(result.success).toBe(true);
    });
  });

  describe('email', () => {
    it('rejects invalid email', () => {
      const result = registerSchema.safeParse({ ...validRegistration, email: 'not-an-email' });
      expect(result.success).toBe(false);
    });

    it('rejects empty email', () => {
      const result = registerSchema.safeParse({ ...validRegistration, email: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('password', () => {
    it('rejects password shorter than 8 chars', () => {
      const result = registerSchema.safeParse({ ...validRegistration, password: 'short' });
      expect(result.success).toBe(false);
    });

    it('accepts password of exactly 8 chars', () => {
      const result = registerSchema.safeParse({ ...validRegistration, password: '12345678' });
      expect(result.success).toBe(true);
    });

    it('rejects empty password', () => {
      const result = registerSchema.safeParse({ ...validRegistration, password: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('phoneNumber', () => {
    it('rejects invalid phone number', () => {
      const result = registerSchema.safeParse({ ...validRegistration, phoneNumber: '12345' });
      expect(result.success).toBe(false);
    });

    it('rejects phone number without +447 prefix', () => {
      const result = registerSchema.safeParse({
        ...validRegistration,
        phoneNumber: '+448900165650',
      });
      expect(result.success).toBe(false);
    });

    it('rejects phone number that is too short', () => {
      const result = registerSchema.safeParse({ ...validRegistration, phoneNumber: '+44790016' });
      expect(result.success).toBe(false);
    });

    it('rejects phone number that is too long', () => {
      const result = registerSchema.safeParse({
        ...validRegistration,
        phoneNumber: '+44790016565099',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({ username: 'nick', password: 'securepass' });
    expect(result.success).toBe(true);
  });

  it('rejects empty username', () => {
    const result = loginSchema.safeParse({ username: '', password: 'securepass' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ username: 'nick', password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing username', () => {
    const result = loginSchema.safeParse({ password: 'securepass' });
    expect(result.success).toBe(false);
  });

  it('rejects missing password', () => {
    const result = loginSchema.safeParse({ username: 'nick' });
    expect(result.success).toBe(false);
  });

  it('accepts single-character username and password', () => {
    const result = loginSchema.safeParse({ username: 'a', password: 'b' });
    expect(result.success).toBe(true);
  });
});

describe('verifyPhoneSchema', () => {
  it('accepts a valid 6-digit code', () => {
    const result = verifyPhoneSchema.safeParse({ code: '123456' });
    expect(result.success).toBe(true);
  });

  it('accepts code of all zeros', () => {
    const result = verifyPhoneSchema.safeParse({ code: '000000' });
    expect(result.success).toBe(true);
  });

  it('rejects code shorter than 6 digits', () => {
    const result = verifyPhoneSchema.safeParse({ code: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects code longer than 6 digits', () => {
    const result = verifyPhoneSchema.safeParse({ code: '1234567' });
    expect(result.success).toBe(false);
  });

  it('rejects code with non-digit characters', () => {
    const result = verifyPhoneSchema.safeParse({ code: '12345a' });
    expect(result.success).toBe(false);
  });

  it('rejects empty code', () => {
    const result = verifyPhoneSchema.safeParse({ code: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing code', () => {
    const result = verifyPhoneSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
