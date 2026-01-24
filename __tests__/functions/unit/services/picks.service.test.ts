// Picks service unit tests

import { savePicks } from '../../../netlify/functions/_shared/services/picks.service';
import { MAX_PLAYERS } from '../../../shared/constants/rules';

// Mock MongoDB
jest.mock('../../../netlify/functions/_shared/db', () => ({
  connectToDatabase: jest.fn(),
}));

describe('Picks Service', () => {
  describe('savePicks', () => {
    it('should reject if player count is not exactly 6', async () => {
      const userId = 'test-user-id';
      const playerIds = ['1', '2', '3']; // Only 3 players

      await expect(savePicks(userId, playerIds)).rejects.toThrow(
        `You must select exactly ${MAX_PLAYERS} players`
      );
    });

    it('should reject duplicate players', async () => {
      const userId = 'test-user-id';
      const playerIds = ['1', '1', '2', '3', '4', '5']; // Duplicate '1'

      await expect(savePicks(userId, playerIds)).rejects.toThrow(
        'Duplicate players are not allowed'
      );
    });

    // Add more tests for budget validation, successful save, etc.
  });
});
