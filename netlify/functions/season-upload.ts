// POST /.netlify/functions/season-upload (Admin only)

import { withAdmin, apiResponse } from './_shared/middleware';
import { processSeasonUpload } from './_shared/services/season-upload.service';
import { seasonUploadSchema } from './_shared/validators/season-upload.validator';
import { z } from 'zod';

export const handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const rawBody = JSON.parse(event.body || '{}');
    const data = seasonUploadSchema.parse(rawBody);
    const result = await processSeasonUpload(data.csvText);

    return apiResponse(200, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => e.message).join('; ');
      return apiResponse(422, null, messages);
    }

    const message = error instanceof Error ? error.message : 'Failed to process upload';
    return apiResponse(400, null, message);
  }
});
