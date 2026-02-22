// POST /.netlify/functions/scores-enter (Admin only)

import { withAdmin, apiResponse } from './_shared/middleware';
import { enterScore, bulkEnterScores } from './_shared/services/scores.service';
import {
  enterScoreSchema,
  bulkEnterScoresSchema,
} from './_shared/validators/scores.validator';
import { createPerfTimer } from './_shared/utils/perf';
import { z } from 'zod';

export const handler = withAdmin(async (event) => {
  const timer = createPerfTimer('scores-enter');
  
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const rawBody = JSON.parse(event.body || '{}');

    // Check if bulk entry (has scores array)
    if (rawBody.scores && Array.isArray(rawBody.scores)) {
      // Validate bulk entry with Zod
      const data = bulkEnterScoresSchema.parse(rawBody);
      const scores = await timer.measure('bulkEnterScores', () => bulkEnterScores({
        tournamentId: data.tournamentId,
        scores: data.scores.map(s => ({
          golferId: s.golferId,
          position: s.position ?? null,
          rawScore: s.rawScore ?? null,
          participated: s.participated,
        })),
      }), { scoreCount: data.scores.length });

      const response = apiResponse(200, scores);
      timer.end(response.body?.length);
      return response;
    }

    // Single score entry - validate with Zod
    const data = enterScoreSchema.parse(rawBody);
    const score = await timer.measure('enterScore', () => enterScore({
      tournamentId: data.tournamentId,
      golferId: data.golferId,
      position: data.position ?? null,
      rawScore: data.rawScore ?? null,
      participated: data.participated,
    }));

    const response = apiResponse(200, score);
    timer.end(response.body?.length);
    return response;
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => e.message).join('; ');
      return apiResponse(422, null, messages);
    }

    const message = error instanceof Error ? error.message : 'Failed to enter score';
    return apiResponse(400, null, message);
  }
});
