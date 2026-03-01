import type { Db, MongoClient } from 'mongodb';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { sendVerificationCode, checkVerificationCode } from '../twilio';
import '../auth';
import { sendPhoneVerification, checkPhoneVerification } from './verification.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('../twilio', () => ({
  sendVerificationCode: vi.fn(),
  checkVerificationCode: vi.fn(),
}));

vi.mock('../auth', () => ({
  generateAccessToken: vi.fn().mockReturnValue('access-token'),
  generateRefreshToken: vi.fn().mockReturnValue('refresh-token'),
  hashRefreshToken: vi.fn().mockReturnValue('hashed-token'),
  getRefreshTokenExpiry: vi.fn().mockReturnValue(new Date('2025-02-01')),
}));

const mockUsersCollection = {
  findOne: vi.fn(),
  updateOne: vi.fn(),
};

const mockTokensCollection = {
  insertOne: vi.fn(),
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
});

describe('verification.service', () => {
  const userId = new ObjectId().toString();

  const makeUserDoc = (overrides = {}) => ({
    _id: new ObjectId(userId),
    firstName: 'Nick',
    lastName: 'Liffen',
    username: 'nickliffen',
    email: 'nick@example.com',
    passwordHash: 'hashed',
    phoneNumber: '+447123456789',
    phoneVerified: false,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('sendPhoneVerification', () => {
    it('throws when user not found', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      await expect(sendPhoneVerification(userId)).rejects.toThrow('User not found');
    });

    it('throws when user has no phone number', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUserDoc({ phoneNumber: null }));
      await expect(sendPhoneVerification(userId)).rejects.toThrow(
        'User does not have a phone number'
      );
    });

    it('throws when phone is already verified', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUserDoc({ phoneVerified: true }));
      await expect(sendPhoneVerification(userId)).rejects.toThrow(
        'Phone number is already verified'
      );
    });

    it('sends verification code on success', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUserDoc());
      vi.mocked(sendVerificationCode).mockResolvedValue('pending');

      await sendPhoneVerification(userId);

      expect(sendVerificationCode).toHaveBeenCalledWith('+447123456789');
    });
  });

  describe('checkPhoneVerification', () => {
    it('throws when user not found', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      await expect(checkPhoneVerification(userId, '123456')).rejects.toThrow('User not found');
    });

    it('throws when phone is already verified', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUserDoc({ phoneVerified: true }));
      await expect(checkPhoneVerification(userId, '123456')).rejects.toThrow(
        'Phone number is already verified'
      );
    });

    it('throws when code is invalid', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUserDoc());
      vi.mocked(checkVerificationCode).mockResolvedValue(false);

      await expect(checkPhoneVerification(userId, '000000')).rejects.toThrow(
        'Invalid or expired verification code'
      );
    });

    it('marks phone verified and returns new tokens on success', async () => {
      const userDoc = makeUserDoc();
      const verifiedDoc = makeUserDoc({ phoneVerified: true });

      // First findOne returns unverified, second returns verified after update
      mockUsersCollection.findOne.mockResolvedValueOnce(userDoc).mockResolvedValueOnce(verifiedDoc);
      mockUsersCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      vi.mocked(checkVerificationCode).mockResolvedValue(true);

      const result = await checkPhoneVerification(userId, '123456', 'Mozilla', '1.2.3.4');

      expect(mockUsersCollection.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId) },
        { $set: { phoneVerified: true, updatedAt: expect.any(Date) } }
      );
      expect(result.token).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(mockTokensCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: 'hashed-token', userId })
      );
    });
  });
});
