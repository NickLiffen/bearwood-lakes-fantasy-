import { ObjectId } from 'mongodb';
import type { Db, MongoClient } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  hashRefreshToken,
} from '../auth';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  validateRefreshToken,
  revokeAllUserTokens,
  revokeRefreshToken,
} from './auth.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('../auth', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  getRefreshTokenExpiry: vi.fn(),
  hashRefreshToken: vi.fn(),
}));

const mockUsersCollection = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
};

const mockTokensCollection = {
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'users') return mockUsersCollection;
        if (name === 'refreshTokens') return mockTokensCollection;
        return {};
      }),
    } as unknown as Db,
    client: {} as unknown as MongoClient,
  });
  vi.mocked(hashRefreshToken).mockReturnValue('hashed-refresh-token');
  vi.mocked(getRefreshTokenExpiry).mockReturnValue(new Date('2025-02-01'));
  vi.mocked(generateRefreshToken).mockReturnValue('new-refresh-token');
  vi.mocked(generateAccessToken).mockReturnValue('jwt-access-token');
});

describe('auth.service', () => {
  const validCreateDTO = {
    firstName: 'Nick',
    lastName: 'Liffen',
    username: 'nickliffen',
    email: 'nick@example.com',
    password: 'Password123!',
    phoneNumber: '+447123456789',
  };

  describe('registerUser', () => {
    it('creates a new user and returns tokens', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      vi.mocked(hashPassword).mockResolvedValue('hashed-pw');
      const insertedId = new ObjectId();
      mockUsersCollection.insertOne.mockResolvedValue({ insertedId });

      const result = await registerUser(validCreateDTO, 'Mozilla/5.0', '1.2.3.4');

      expect(mockUsersCollection.findOne).toHaveBeenCalled();
      expect(mockUsersCollection.insertOne).toHaveBeenCalled();
      expect(result.user.username).toBe('nickliffen');
      expect(result.user.phoneVerified).toBe(false);
      expect(result.token).toBe('jwt-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(mockTokensCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: 'hashed-refresh-token',
          userId: insertedId.toString(),
        })
      );
    });

    it('throws when email already exists', async () => {
      mockUsersCollection.findOne.mockResolvedValue({
        email: 'nick@example.com',
        username: 'other',
      });

      await expect(registerUser(validCreateDTO)).rejects.toThrow('Email already exists');
    });

    it('throws when username already exists', async () => {
      mockUsersCollection.findOne.mockResolvedValue({
        email: 'other@example.com',
        username: 'nickliffen',
      });

      await expect(registerUser(validCreateDTO)).rejects.toThrow('Username already exists');
    });

    it('throws when phone number already exists', async () => {
      mockUsersCollection.findOne.mockResolvedValue({
        email: 'other@example.com',
        username: 'other',
        phoneNumber: '+447123456789',
      });

      await expect(registerUser(validCreateDTO)).rejects.toThrow('Phone number already exists');
    });

    it('handles MongoDB duplicate key error for email', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      vi.mocked(hashPassword).mockResolvedValue('hashed-pw');
      const err = new Error('E11000 duplicate key error email');
      (err as Error & { code: number }).code = 11000;
      mockUsersCollection.insertOne.mockRejectedValue(err);

      await expect(registerUser(validCreateDTO)).rejects.toThrow('Email already exists');
    });
  });

  describe('loginUser', () => {
    const userId = new ObjectId();
    const mockUserDoc = {
      _id: userId,
      firstName: 'Nick',
      lastName: 'Liffen',
      username: 'nickliffen',
      email: 'nick@example.com',
      passwordHash: 'hashed-pw',
      phoneNumber: '+447123456789',
      phoneVerified: true,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns tokens for valid credentials', async () => {
      mockUsersCollection.findOne.mockResolvedValue(mockUserDoc);
      vi.mocked(comparePassword).mockResolvedValue(true);

      const result = await loginUser({ username: 'nickliffen', password: 'Password123!' });

      expect(result.user.username).toBe('nickliffen');
      expect(result.token).toBe('jwt-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('throws for non-existent user', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      await expect(loginUser({ username: 'nobody', password: 'x' })).rejects.toThrow(
        'Invalid username or password'
      );
    });

    it('throws for wrong password', async () => {
      mockUsersCollection.findOne.mockResolvedValue(mockUserDoc);
      vi.mocked(comparePassword).mockResolvedValue(false);

      await expect(loginUser({ username: 'nickliffen', password: 'wrong' })).rejects.toThrow(
        'Invalid username or password'
      );
    });
  });

  describe('validateRefreshToken', () => {
    it('returns user and revokes token on valid refresh', async () => {
      const tokenDocId = new ObjectId();
      const userId = new ObjectId();
      mockTokensCollection.findOne.mockResolvedValue({
        _id: tokenDocId,
        tokenHash: 'hashed-refresh-token',
        userId: userId.toString(),
        expiresAt: new Date('2099-01-01'),
      });
      mockUsersCollection.findOne.mockResolvedValue({
        _id: userId,
        firstName: 'Nick',
        lastName: 'Liffen',
        username: 'nickliffen',
        email: 'nick@example.com',
        phoneNumber: null,
        phoneVerified: false,
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const user = await validateRefreshToken('some-token');

      expect(user.username).toBe('nickliffen');
      // Token should be revoked (rotation)
      expect(mockTokensCollection.updateOne).toHaveBeenCalledWith(
        { _id: tokenDocId },
        { $set: { revokedAt: expect.any(Date) } }
      );
    });

    it('throws when token not found or expired', async () => {
      mockTokensCollection.findOne.mockResolvedValue(null);

      await expect(validateRefreshToken('bad-token')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });

    it('throws when user not found', async () => {
      mockTokensCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        tokenHash: 'hashed-refresh-token',
        userId: new ObjectId().toString(),
      });
      mockUsersCollection.findOne.mockResolvedValue(null);

      await expect(validateRefreshToken('some-token')).rejects.toThrow('User not found');
    });
  });

  describe('refreshAccessToken', () => {
    it('issues new token pair after consuming old refresh token', async () => {
      const userId = new ObjectId();
      const tokenDocId = new ObjectId();
      mockTokensCollection.findOne.mockResolvedValue({
        _id: tokenDocId,
        tokenHash: 'hashed-refresh-token',
        userId: userId.toString(),
      });
      mockUsersCollection.findOne.mockResolvedValue({
        _id: userId,
        firstName: 'Nick',
        lastName: 'Liffen',
        username: 'nickliffen',
        email: 'nick@example.com',
        phoneNumber: null,
        phoneVerified: true,
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await refreshAccessToken('old-refresh-token', 'Mozilla', '1.2.3.4');

      expect(result.token).toBe('jwt-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      // Old token revoked + new token stored = 1 updateOne + 2 insertOne
      expect(mockTokensCollection.updateOne).toHaveBeenCalled();
      expect(mockTokensCollection.insertOne).toHaveBeenCalled();
    });
  });

  describe('revokeAllUserTokens', () => {
    it('revokes all non-revoked tokens for a user', async () => {
      mockTokensCollection.updateMany.mockResolvedValue({ modifiedCount: 3 });

      await revokeAllUserTokens('user-123');

      expect(mockTokensCollection.updateMany).toHaveBeenCalledWith(
        { userId: 'user-123', revokedAt: { $exists: false } },
        { $set: { revokedAt: expect.any(Date) } }
      );
    });
  });

  describe('revokeRefreshToken', () => {
    it('revokes a specific refresh token by hash', async () => {
      mockTokensCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await revokeRefreshToken('my-refresh-token');

      expect(mockTokensCollection.updateOne).toHaveBeenCalledWith(
        { tokenHash: 'hashed-refresh-token' },
        { $set: { revokedAt: expect.any(Date) } }
      );
    });
  });
});
