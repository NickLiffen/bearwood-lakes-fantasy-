import { ObjectId } from 'mongodb';
import type { Db, MongoClient } from 'mongodb';
import { connectToDatabase } from '../db';
import {
  createLeague,
  getLeagueById,
  getLeagueByInviteCode,
  getUserLeagues,
  getLeagueMembers,
  joinLeague,
  leaveLeague,
  updateLeague,
  deleteLeague,
  removeMember,
  transferAdmin,
  regenerateInviteCode,
} from './leagues.service';

vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue(Buffer.from([1, 2, 3, 4, 5, 6])),
  },
}));

const mockLeaguesCollection = {
  findOne: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
  insertOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn(),
};

const mockUsersCollection = {
  find: vi.fn(),
};

const toArrayHelper = <T>(items: T[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
});

const projectHelper = <T>(items: T[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
  project: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectToDatabase).mockResolvedValue({
    db: {
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === 'leagues') return mockLeaguesCollection;
        if (name === 'users') return mockUsersCollection;
        return {};
      }),
    } as unknown as Db,
    client: {} as unknown as MongoClient,
  });
});

const adminId = new ObjectId().toString();
const memberId = new ObjectId().toString();
const leagueId = new ObjectId().toString();
const leagueObjectId = new ObjectId(leagueId);

function makeLeagueDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: leagueObjectId,
    name: 'Test League',
    description: 'A test league',
    inviteCode: 'ABC123',
    adminId: new ObjectId(adminId),
    memberIds: [new ObjectId(adminId)],
    maxMembers: 50,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('leagues.service', () => {
  describe('createLeague', () => {
    it('creates a league with admin as first member and generates invite code', async () => {
      mockLeaguesCollection.countDocuments.mockResolvedValue(0);
      // ensureUniqueInviteCode calls findOne to check uniqueness
      mockLeaguesCollection.findOne.mockResolvedValue(null);
      const insertedId = new ObjectId();
      mockLeaguesCollection.insertOne.mockResolvedValue({ insertedId });

      const result = await createLeague(adminId, 'My League', 'desc');

      expect(result.name).toBe('My League');
      expect(result.description).toBe('desc');
      expect(result.adminId).toBe(adminId);
      expect(result.memberIds).toContain(adminId);
      expect(result.inviteCode).toBeTruthy();
      expect(mockLeaguesCollection.insertOne).toHaveBeenCalledTimes(1);
    });

    it('rejects if user is already in 10 leagues', async () => {
      mockLeaguesCollection.countDocuments.mockResolvedValue(10);

      await expect(createLeague(adminId, 'My League')).rejects.toThrow(
        'You can only be in 10 leagues at a time'
      );
      expect(mockLeaguesCollection.insertOne).not.toHaveBeenCalled();
    });
  });

  describe('getLeagueById', () => {
    it('returns league when found', async () => {
      const doc = makeLeagueDoc();
      mockLeaguesCollection.findOne.mockResolvedValue(doc);

      const result = await getLeagueById(leagueId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(leagueId);
      expect(result!.name).toBe('Test League');
    });

    it('returns null when not found', async () => {
      mockLeaguesCollection.findOne.mockResolvedValue(null);

      const result = await getLeagueById(leagueId);
      expect(result).toBeNull();
    });
  });

  describe('getLeagueByInviteCode', () => {
    it('returns league for valid invite code', async () => {
      const doc = makeLeagueDoc();
      mockLeaguesCollection.findOne.mockResolvedValue(doc);

      const result = await getLeagueByInviteCode('abc123');
      expect(result).not.toBeNull();
      expect(result!.inviteCode).toBe('ABC123');
    });

    it('returns null for invalid invite code', async () => {
      mockLeaguesCollection.findOne.mockResolvedValue(null);

      const result = await getLeagueByInviteCode('INVALID');
      expect(result).toBeNull();
    });
  });

  describe('getUserLeagues', () => {
    it('returns leagues containing the userId', async () => {
      const docs = [makeLeagueDoc(), makeLeagueDoc({ _id: new ObjectId(), name: 'League 2' })];
      mockLeaguesCollection.find.mockReturnValue(toArrayHelper(docs));

      const result = await getUserLeagues(adminId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Test League');
      expect(result[1].name).toBe('League 2');
    });

    it('returns empty array when user has no leagues', async () => {
      mockLeaguesCollection.find.mockReturnValue(toArrayHelper([]));

      const result = await getUserLeagues(adminId);
      expect(result).toEqual([]);
    });
  });

  describe('getLeagueMembers', () => {
    it('returns member info for league members', async () => {
      const adminOid = new ObjectId(adminId);
      const memberOid = new ObjectId(memberId);
      const league = {
        id: leagueId,
        name: 'Test',
        description: '',
        inviteCode: 'ABC123',
        adminId,
        memberIds: [adminId, memberId],
        memberCount: 2,
        maxMembers: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const users = [
        { _id: adminOid, firstName: 'Admin', lastName: 'User', username: 'admin' },
        { _id: memberOid, firstName: 'Member', lastName: 'User', username: 'member' },
      ];
      mockUsersCollection.find.mockReturnValue(projectHelper(users));

      const result = await getLeagueMembers(league);

      expect(result).toHaveLength(2);
      const admin = result.find((m) => m.userId === adminId);
      expect(admin!.isAdmin).toBe(true);
      const member = result.find((m) => m.userId === memberId);
      expect(member!.isAdmin).toBe(false);
    });
  });

  describe('joinLeague', () => {
    it('adds user to league with valid invite code', async () => {
      const doc = makeLeagueDoc();
      mockLeaguesCollection.countDocuments.mockResolvedValue(0);
      mockLeaguesCollection.findOne.mockResolvedValue(doc);
      const updatedDoc = makeLeagueDoc({
        memberIds: [new ObjectId(adminId), new ObjectId(memberId)],
      });
      mockLeaguesCollection.findOneAndUpdate.mockResolvedValue(updatedDoc);

      const result = await joinLeague(memberId, 'ABC123');

      expect(result.memberIds).toContain(memberId);
      expect(mockLeaguesCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid invite code', async () => {
      mockLeaguesCollection.countDocuments.mockResolvedValue(0);
      mockLeaguesCollection.findOne.mockResolvedValue(null);

      await expect(joinLeague(memberId, 'BADCODE')).rejects.toThrow('Invalid invite code');
    });

    it('rejects if user is already a member', async () => {
      const doc = makeLeagueDoc();
      mockLeaguesCollection.countDocuments.mockResolvedValue(0);
      mockLeaguesCollection.findOne.mockResolvedValue(doc);

      // adminId is already in memberIds
      await expect(joinLeague(adminId, 'ABC123')).rejects.toThrow(
        'You are already a member of this league'
      );
    });

    it('rejects if league is full', async () => {
      const doc = makeLeagueDoc({ maxMembers: 1 });
      mockLeaguesCollection.countDocuments.mockResolvedValue(0);
      mockLeaguesCollection.findOne.mockResolvedValue(doc);

      await expect(joinLeague(memberId, 'ABC123')).rejects.toThrow('This league is full');
    });

    it('rejects if user is in 10+ leagues', async () => {
      mockLeaguesCollection.countDocuments.mockResolvedValue(10);

      await expect(joinLeague(memberId, 'ABC123')).rejects.toThrow(
        'You can only be in 10 leagues at a time'
      );
    });
  });

  describe('leaveLeague', () => {
    it('removes member from league', async () => {
      const doc = makeLeagueDoc({
        memberIds: [new ObjectId(adminId), new ObjectId(memberId)],
      });
      mockLeaguesCollection.findOne.mockResolvedValue(doc);
      mockLeaguesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await leaveLeague(memberId, leagueId);

      expect(mockLeaguesCollection.updateOne).toHaveBeenCalledTimes(1);
    });

    it('rejects admin leaving', async () => {
      const doc = makeLeagueDoc();
      mockLeaguesCollection.findOne.mockResolvedValue(doc);

      await expect(leaveLeague(adminId, leagueId)).rejects.toThrow(
        'Admin cannot leave the league. Transfer admin first.'
      );
    });

    it('throws if league not found', async () => {
      mockLeaguesCollection.findOne.mockResolvedValue(null);

      await expect(leaveLeague(memberId, leagueId)).rejects.toThrow('League not found');
    });
  });

  describe('updateLeague', () => {
    it('updates name and description', async () => {
      const updatedDoc = makeLeagueDoc({ name: 'New Name', description: 'New desc' });
      mockLeaguesCollection.findOneAndUpdate.mockResolvedValue(updatedDoc);

      const result = await updateLeague(leagueId, { name: 'New Name', description: 'New desc' });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('New Name');
      expect(result!.description).toBe('New desc');
    });

    it('returns null if league not found', async () => {
      mockLeaguesCollection.findOneAndUpdate.mockResolvedValue(null);

      const result = await updateLeague(leagueId, { name: 'Nope' });
      expect(result).toBeNull();
    });
  });

  describe('deleteLeague', () => {
    it('deletes league and returns true', async () => {
      mockLeaguesCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await deleteLeague(leagueId);
      expect(result).toBe(true);
    });

    it('returns false if league not found', async () => {
      mockLeaguesCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await deleteLeague(leagueId);
      expect(result).toBe(false);
    });
  });

  describe('removeMember', () => {
    it('removes target member', async () => {
      const doc = makeLeagueDoc({
        memberIds: [new ObjectId(adminId), new ObjectId(memberId)],
      });
      mockLeaguesCollection.findOne.mockResolvedValue(doc);
      mockLeaguesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await removeMember(leagueId, memberId);

      expect(mockLeaguesCollection.updateOne).toHaveBeenCalledTimes(1);
    });

    it('rejects removing the admin', async () => {
      const doc = makeLeagueDoc();
      mockLeaguesCollection.findOne.mockResolvedValue(doc);

      await expect(removeMember(leagueId, adminId)).rejects.toThrow(
        'Cannot remove the league admin'
      );
    });

    it('rejects removing a non-member', async () => {
      const doc = makeLeagueDoc();
      mockLeaguesCollection.findOne.mockResolvedValue(doc);
      const nonMemberId = new ObjectId().toString();

      await expect(removeMember(leagueId, nonMemberId)).rejects.toThrow(
        'User is not a member of this league'
      );
    });

    it('throws if league not found', async () => {
      mockLeaguesCollection.findOne.mockResolvedValue(null);

      await expect(removeMember(leagueId, memberId)).rejects.toThrow('League not found');
    });
  });

  describe('transferAdmin', () => {
    it('updates adminId to new member', async () => {
      const doc = makeLeagueDoc({
        memberIds: [new ObjectId(adminId), new ObjectId(memberId)],
      });
      mockLeaguesCollection.findOne.mockResolvedValue(doc);
      const updatedDoc = makeLeagueDoc({
        adminId: new ObjectId(memberId),
        memberIds: [new ObjectId(adminId), new ObjectId(memberId)],
      });
      mockLeaguesCollection.findOneAndUpdate.mockResolvedValue(updatedDoc);

      const result = await transferAdmin(leagueId, memberId);

      expect(result).not.toBeNull();
      expect(result!.adminId).toBe(memberId);
    });

    it('rejects non-member as new admin', async () => {
      const doc = makeLeagueDoc();
      mockLeaguesCollection.findOne.mockResolvedValue(doc);
      const nonMemberId = new ObjectId().toString();

      await expect(transferAdmin(leagueId, nonMemberId)).rejects.toThrow(
        'New admin must be a current member'
      );
    });

    it('throws if league not found', async () => {
      mockLeaguesCollection.findOne.mockResolvedValue(null);

      await expect(transferAdmin(leagueId, memberId)).rejects.toThrow('League not found');
    });
  });

  describe('regenerateInviteCode', () => {
    it('generates a new invite code', async () => {
      // ensureUniqueInviteCode: findOne returns null (code is unique)
      mockLeaguesCollection.findOne.mockResolvedValue(null);
      const updatedDoc = makeLeagueDoc({ inviteCode: 'NEWCODE' });
      mockLeaguesCollection.findOneAndUpdate.mockResolvedValue(updatedDoc);

      const result = await regenerateInviteCode(leagueId);

      expect(result).not.toBeNull();
      expect(result!.inviteCode).toBe('NEWCODE');
      expect(mockLeaguesCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('returns null if league not found', async () => {
      mockLeaguesCollection.findOne.mockResolvedValue(null);
      mockLeaguesCollection.findOneAndUpdate.mockResolvedValue(null);

      const result = await regenerateInviteCode(leagueId);
      expect(result).toBeNull();
    });
  });
});
