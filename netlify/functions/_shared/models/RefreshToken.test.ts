import { ObjectId } from 'mongodb';
import { toRefreshToken, REFRESH_TOKENS_COLLECTION } from './RefreshToken';
import type { RefreshTokenDocument } from './RefreshToken';

describe('RefreshToken model', () => {
  const now = new Date();
  const objectId = new ObjectId();

  const fullDoc: RefreshTokenDocument = {
    _id: objectId,
    tokenHash: 'abc123hash',
    userId: 'user-456',
    expiresAt: new Date(now.getTime() + 30 * 86400000),
    createdAt: now,
    revokedAt: undefined,
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
  };

  describe('toRefreshToken', () => {
    it('converts _id to string id', () => {
      expect(toRefreshToken(fullDoc).id).toBe(objectId.toString());
    });

    it('maps tokenHash', () => {
      expect(toRefreshToken(fullDoc).tokenHash).toBe('abc123hash');
    });

    it('maps userId', () => {
      expect(toRefreshToken(fullDoc).userId).toBe('user-456');
    });

    it('maps expiresAt and createdAt', () => {
      const rt = toRefreshToken(fullDoc);
      expect(rt.expiresAt).toBe(fullDoc.expiresAt);
      expect(rt.createdAt).toBe(now);
    });

    it('maps revokedAt when undefined', () => {
      expect(toRefreshToken(fullDoc).revokedAt).toBeUndefined();
    });

    it('maps revokedAt when set', () => {
      const revokedDoc = { ...fullDoc, revokedAt: now };
      expect(toRefreshToken(revokedDoc).revokedAt).toBe(now);
    });

    it('does not include userAgent or ipAddress', () => {
      const rt = toRefreshToken(fullDoc);
      expect(rt).not.toHaveProperty('userAgent');
      expect(rt).not.toHaveProperty('ipAddress');
    });
  });

  describe('REFRESH_TOKENS_COLLECTION', () => {
    it('equals "refreshTokens"', () => {
      expect(REFRESH_TOKENS_COLLECTION).toBe('refreshTokens');
    });
  });
});
