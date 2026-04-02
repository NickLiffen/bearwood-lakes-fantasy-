// GET /.netlify/functions/team-of-week
// Returns the "dream team" — top 6 highest-scoring golfers for a completed gameweek

import { withVerifiedAuth } from './_shared/middleware';
import { getTeamOfTheWeek } from './_shared/services/leaderboard.service';
import { getActiveSeason } from './_shared/services/seasons.service';

export const handler = withVerifiedAuth(async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  const date = event.queryStringParameters?.date;
  const seasonParam = event.queryStringParameters?.season;

  if (!date) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: 'date query parameter is required' }),
    };
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: 'date must be in YYYY-MM-DD format' }),
    };
  }

  let season: number;
  if (seasonParam) {
    season = parseInt(seasonParam, 10);
    if (isNaN(season)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'season must be a number' }),
      };
    }
  } else {
    const activeSeason = await getActiveSeason();
    season = activeSeason
      ? parseInt(activeSeason.name, 10) || new Date().getFullYear()
      : new Date().getFullYear();
  }

  const result = await getTeamOfTheWeek(date, season);

  if (result === null) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        error: 'Team of the Week is only available for completed gameweeks',
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, data: result }),
  };
}, 'read');
