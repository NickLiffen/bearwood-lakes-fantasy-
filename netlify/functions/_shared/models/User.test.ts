import { ObjectId } from 'mongodb';
import { toUser, USERS_COLLECTION } from './User';
import type { UserDocument } from './User';

describe('User model', () => {
  const now = new Date();
  const objectId = new ObjectId();

  const fullDoc: UserDocument = {
    _id: objectId,
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    email: 'john@example.com',
    passwordHash: 'hashed',
    phoneNumber: '+1234567890',
    phoneVerified: true,
    role: 'player',
    createdAt: now,
    updatedAt: now,
  };

  describe('toUser', () => {
    it('converts _id to string id', () => {
      const user = toUser(fullDoc);
      expect(user.id).toBe(objectId.toString());
    });

    it('maps all fields correctly', () => {
      const user = toUser(fullDoc);
      expect(user.firstName).toBe('John');
      expect(user.lastName).toBe('Doe');
      expect(user.username).toBe('johndoe');
      expect(user.email).toBe('john@example.com');
      expect(user.phoneNumber).toBe('+1234567890');
      expect(user.phoneVerified).toBe(true);
      expect(user.role).toBe('player');
      expect(user.createdAt).toBe(now);
      expect(user.updatedAt).toBe(now);
    });

    it('does not include passwordHash', () => {
      const user = toUser(fullDoc);
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('defaults phoneNumber to null when nullish', () => {
      const doc = { ...fullDoc, phoneNumber: null };
      expect(toUser(doc).phoneNumber).toBeNull();
    });

    it('defaults phoneVerified to false when undefined', () => {
      const doc = { ...fullDoc, phoneVerified: undefined } as unknown as UserDocument;
      expect(toUser(doc).phoneVerified).toBe(false);
    });
  });

  describe('USERS_COLLECTION', () => {
    it('equals "users"', () => {
      expect(USERS_COLLECTION).toBe('users');
    });
  });
});
