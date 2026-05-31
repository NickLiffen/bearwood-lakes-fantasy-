// POST /.netlify/functions/tournament-parse-csv (Admin + Tournament Uploader)
// Accepts CSV text, extracts tournament data server-side

import { withRole, apiResponse } from './_shared/middleware';
import { parseTournamentCsv } from './_shared/services/csv-parser.service';
import { tournamentParseCsvSchema } from './_shared/validators/tournament-parse-csv.validator';
import { z } from 'zod';

export const handler = withRole(
  'admin',
  'tournament_uploader'
)(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const rawBody = JSON.parse(event.body || '{}');
    const { csv } = tournamentParseCsvSchema.parse(rawBody);

    const result = parseTournamentCsv(csv);

    if (result.golfers.length === 0) {
      return apiResponse(
        422,
        null,
        'No golfer data found in the CSV. Expected headers are Position plus either Player or First Name + Last Name, and a score column (Stableford Points, To Par, Total Net, or Nett Score).'
      );
    }

    return apiResponse(200, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join('; ');
      return apiResponse(422, null, messages);
    }

    const message = error instanceof Error ? error.message : 'Failed to parse CSV.';
    return apiResponse(400, null, message);
  }
});
