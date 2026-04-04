// POST /.netlify/functions/tournament-parse-pdf (Admin + Tournament Uploader)
// Accepts a base64-encoded PDF, extracts tournament data server-side

import { withRole, apiResponse } from './_shared/middleware';
import { parsePdfBuffer } from './_shared/services/pdf-parser.service';
import { tournamentParsePdfSchema } from './_shared/validators/tournament-parse-pdf.validator';
import { z } from 'zod';

export const handler = withRole('admin', 'tournament_uploader')(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const rawBody = JSON.parse(event.body || '{}');
    const { pdf } = tournamentParsePdfSchema.parse(rawBody);

    const buffer = Buffer.from(pdf, 'base64');

    // Basic PDF validation: check magic bytes
    if (buffer.length < 5 || buffer.toString('ascii', 0, 5) !== '%PDF-') {
      return apiResponse(400, null, 'Invalid PDF file. The uploaded data is not a valid PDF.');
    }

    const result = await parsePdfBuffer(buffer);

    if (result.golfers.length === 0) {
      return apiResponse(
        422,
        null,
        'No golfer data found in the PDF. Please check the file is an ECG leaderboard.'
      );
    }

    return apiResponse(200, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join('; ');
      return apiResponse(422, null, messages);
    }

    const message =
      error instanceof Error ? error.message : 'Failed to parse PDF. Is this an ECG leaderboard?';
    return apiResponse(400, null, message);
  }
});
