import type { JwtPayload } from '../_shared/auth';

/**
 * Common JWT payloads for testing different auth scenarios.
 */
export const mockUsers = {
  player: {
    userId: 'user-player-1',
    username: 'testplayer',
    role: 'player',
    phoneVerified: true,
  } satisfies JwtPayload,

  admin: {
    userId: 'user-admin-1',
    username: 'testadmin',
    role: 'admin',
    phoneVerified: true,
  } satisfies JwtPayload,

  unverified: {
    userId: 'user-unverified-1',
    username: 'unverified',
    role: 'player',
    phoneVerified: false,
  } satisfies JwtPayload,
};
