// POST /.netlify/functions/scores-enter (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { enterScore, bulkEnterScores } from './_shared/services/scores.service';
import type { EnterScoreRequest, BulkEnterScoresRequest } from '../../shared/types';

// Validation function for bulk scores
function validateBulkScores(scores: BulkEnterScoresRequest['scores']): { valid: boolean; error: string } {
  const participatingScores = scores.filter(s => s.participated);
  
  // Rule 1: At least 1 player must have participated
  if (participatingScores.length === 0) {
    return { valid: false, error: 'At least one player must have participated' };
  }

  // Determine tier based on participant count
  const count = participatingScores.length;
  const tier = count <= 10 ? '0-10' : count < 20 ? '10-20' : '20+';
  
  // Check for required positions
  const hasFirst = participatingScores.some(s => s.position === 1);
  const hasSecond = participatingScores.some(s => s.position === 2);
  const hasThird = participatingScores.some(s => s.position === 3);

  // Rule 2: 0-10 players → must have 1st place
  if (tier === '0-10') {
    if (!hasFirst) {
      return { valid: false, error: 'With 1-10 players, you must assign a 1st place finish' };
    }
  }

  // Rule 3: 10-20 players → must have 1st and 2nd place
  if (tier === '10-20') {
    if (!hasFirst || !hasSecond) {
      return { valid: false, error: 'With 10-20 players, you must assign both 1st and 2nd place finishes' };
    }
  }

  // Rule 4: 20+ players → must have 1st, 2nd, and 3rd place
  if (tier === '20+') {
    if (!hasFirst || !hasSecond || !hasThird) {
      return { valid: false, error: 'With 20+ players, you must assign 1st, 2nd, and 3rd place finishes' };
    }
  }

  // Check for duplicate positions (only for positions 1, 2, 3)
  const positions = participatingScores
    .filter(s => s.position !== null && s.position !== undefined && s.position >= 1 && s.position <= 3)
    .map(s => s.position);
  const uniquePositions = new Set(positions);
  if (positions.length !== uniquePositions.size) {
    return { valid: false, error: 'Duplicate positions found. Each position (1st, 2nd, 3rd) can only be assigned once' };
  }

  return { valid: true, error: '' };
}

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Check if bulk entry (has scores array)
    if (body.scores && Array.isArray(body.scores)) {
      const data: BulkEnterScoresRequest = body;

      if (!data.tournamentId || data.scores.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: 'tournamentId and scores array are required' }),
        };
      }

      // Validate the scores
      const validation = validateBulkScores(data.scores);
      if (!validation.valid) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: validation.error }),
        };
      }

      const scores = await bulkEnterScores(data);

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: scores }),
      };
    }

    // Single score entry
    const data: EnterScoreRequest = body;

    if (!data.tournamentId || !data.playerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: 'tournamentId and playerId are required',
        }),
      };
    }

    const score = await enterScore(data);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: score }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enter score';
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
