import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
  generateToken,
} from './auth';

describe('auth utilities', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'test-secret-key-for-jwt');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('hashPassword / comparePassword', () => {
    it('hashes a password and verifies it', async () => {
      const password = 'MySecureP@ss1';
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      expect(await comparePassword(password, hash)).toBe(true);
    });

    it('rejects wrong password', async () => {
      const hash = await hashPassword('correct-horse');
      expect(await comparePassword('wrong-horse', hash)).toBe(false);
    });

    it('produces different hashes for same password (salted)', async () => {
      const h1 = await hashPassword('same');
      const h2 = await hashPassword('same');
      expect(h1).not.toBe(h2);
    });
  });

  describe('generateAccessToken / verifyToken', () => {
    const mockUser = {
      id: 'user-123',
      username: 'testuser',
      role: 'player' as const,
      phoneVerified: true,
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phoneNumber: '+1234567890',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('generates a JWT token string', () => {
      const token = generateAccessToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('round-trips: verify decodes correct payload', () => {
      const token = generateAccessToken(mockUser);
      const payload = verifyToken(token);
      expect(payload.userId).toBe('user-123');
      expect(payload.username).toBe('testuser');
      expect(payload.role).toBe('player');
      expect(payload.phoneVerified).toBe(true);
    });

    it('defaults phoneVerified to false when undefined', () => {
      const user = { ...mockUser, phoneVerified: undefined as unknown as boolean };
      const token = generateAccessToken(user);
      const payload = verifyToken(token);
      expect(payload.phoneVerified).toBe(false);
    });

    it('throws on invalid token', () => {
      expect(() => verifyToken('invalid.token.string')).toThrow();
    });

    it('throws on tampered token', () => {
      const token = generateAccessToken(mockUser);
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyToken(tampered)).toThrow();
    });

    it('throws when JWT_SECRET is missing', () => {
      vi.stubEnv('JWT_SECRET', '');
      expect(() => generateAccessToken(mockUser)).toThrow('Missing required environment variable');
    });
  });

  describe('generateRefreshToken', () => {
    it('returns a 128-character hex string', () => {
      const token = generateRefreshToken();
      expect(token).toHaveLength(128);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('generates unique tokens', () => {
      const tokens = new Set(Array.from({ length: 20 }, () => generateRefreshToken()));
      expect(tokens.size).toBe(20);
    });
  });

  describe('hashRefreshToken', () => {
    it('returns a SHA-256 hex string (64 chars)', () => {
      const hash = hashRefreshToken('some-token');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('is deterministic', () => {
      const h1 = hashRefreshToken('token-abc');
      const h2 = hashRefreshToken('token-abc');
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different inputs', () => {
      const h1 = hashRefreshToken('token-a');
      const h2 = hashRefreshToken('token-b');
      expect(h1).not.toBe(h2);
    });
  });

  describe('getRefreshTokenExpiry', () => {
    it('returns a Date ~30 days from now', () => {
      const now = new Date();
      const expiry = getRefreshTokenExpiry();

      const diffDays = (expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(31);
    });

    it('returns a Date instance', () => {
      expect(getRefreshTokenExpiry()).toBeInstanceOf(Date);
    });
  });

  describe('generateToken (legacy alias)', () => {
    it('is the same function as generateAccessToken', () => {
      expect(generateToken).toBe(generateAccessToken);
    });
  });
});
