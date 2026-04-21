// GET /.netlify/functions/fantasy-stats-csv
// Returns a downloadable CSV with per-gameweek points and ownership % for every golfer.

import { withAdmin, AuthenticatedEvent } from './_shared/middleware';
import { generateFantasyCsv } from './_shared/services/fantasy-csv.service';
import { internalError, methodNotAllowed } from './_shared/utils/response';

export const handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'GET') {
    return methodNotAllowed();
  }

  try {
    const queryParams = event.queryStringParameters || {};
    const season = queryParams.season ? parseInt(queryParams.season, 10) : undefined;

    const { csv, maxGameweek } = await generateFantasyCsv({ season });

    const seasonLabel = season || 'current';
    const filename = `fantasy-stats-season-${seasonLabel}-gw${maxGameweek}.csv`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: csv,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'Season not found') {
      return { statusCode: 404, body: JSON.stringify({ success: false, error: message }) };
    }
    return internalError(error);
  }
});
