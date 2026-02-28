import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../db';
import { getAllUsers, getUserById } from './users.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

const mockUsersCollection = {
  find: vi.fn(),
  findOne: vi.fn(),
};

const toArrayHelper = (items: any[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockReturnValue(mockUsersCollection),
    } as any,
    client: {} as any,
  });
});

describe('users.service', () => {
  const userId = new ObjectId();
  const userDoc = {
    _id: userId,
    firstName: 'Nick',
    lastName: 'Liffen',
    username: 'nickliffen',
    email: 'nick@example.com',
    passwordHash: 'hashed',
    phoneNumber: '+447123456789',
    phoneVerified: true,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('getAllUsers', () => {
    it('returns all users mapped via toUser', async () => {
      mockUsersCollection.find.mockReturnValue(toArrayHelper([userDoc]));

      const result = await getAllUsers();

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('nickliffen');
      expect(result[0].id).toBe(userId.toString());
      // Should not include passwordHash in the returned user
      expect((result[0] as any).passwordHash).toBeUndefined();
    });

    it('returns empty array when no users', async () => {
      mockUsersCollection.find.mockReturnValue(toArrayHelper([]));

      const result = await getAllUsers();

      expect(result).toEqual([]);
    });
  });

  describe('getUserById', () => {
    it('returns user when found', async () => {
      mockUsersCollection.findOne.mockResolvedValue(userDoc);

      const result = await getUserById(userId.toString());

      expect(result).toBeDefined();
      expect(result!.firstName).toBe('Nick');
      expect(result!.email).toBe('nick@example.com');
    });

    it('returns null when user not found', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      const result = await getUserById(new ObjectId().toString());

      expect(result).toBeNull();
    });
  });
});
