// POST /.netlify/functions/tournament-upload (Admin only)
// Processes confirmed tournament data from PDF upload

import { withAdmin, apiResponse } from './_shared/middleware';
import { processTournamentUpload } from './_shared/services/tournament-upload.service';
import { tournamentUploadSchema } from './_shared/validators/tournament-upload.validator';
import { z } from 'zod';

export const handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const rawBody = JSON.parse(event.body || '{}');
    const data = tournamentUploadSchema.parse(rawBody);
    const result = await processTournamentUpload(data);

    return apiResponse(200, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join('; ');
      return apiResponse(422, null, messages);
    }

    const message = error instanceof Error ? error.message : 'Failed to process tournament upload';
    return apiResponse(400, null, message);
  }
});
