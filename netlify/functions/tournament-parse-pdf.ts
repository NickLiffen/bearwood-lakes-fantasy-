// POST /.netlify/functions/tournament-parse-pdf (Admin only)
// Accepts a base64-encoded PDF, extracts tournament data server-side

import { withAdmin, apiResponse } from './_shared/middleware';
import { parsePdfBuffer } from './_shared/services/pdf-parser.service';

export const handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { pdf } = body;

    if (!pdf || typeof pdf !== 'string') {
      return apiResponse(400, null, 'Missing or invalid "pdf" field. Expected base64-encoded PDF.');
    }

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
    const message =
      error instanceof Error ? error.message : 'Failed to parse PDF. Is this an ECG leaderboard?';
    return apiResponse(400, null, message);
  }
});
