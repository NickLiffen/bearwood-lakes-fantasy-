// GET /.netlify/functions/players-get?id=xxx

import { withAuth } from './_shared/middleware';
import { getPlayerById } from './_shared/services/players.service';
import { getAllTournaments } from './_shared/services/tournaments.service';
import { getScoresForPlayer } from './_shared/services/scores.service';

// Get the start of the current week (Monday 00:00)
function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

// Get the start of the current month
function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

// Get the start of 2026 season
function getSeasonStart(): Date {
  return new Date(2026, 0, 1, 0, 0, 0, 0);
}

export const handler = withAuth(async (event) => {
  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Player ID is required' }),
      };
    }

    const [player, tournaments, playerScores] = await Promise.all([
      getPlayerById(id),
      getAllTournaments(),
      getScoresForPlayer(id),
    ]);

    if (!player) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Player not found' }),
      };
    }

    // Get published/complete tournaments for 2026
    const publishedTournaments = tournaments.filter(
      t => (t.status === 'published' || t.status === 'complete') && t.season === 2026
    );
    const publishedTournamentIds = new Set(publishedTournaments.map(t => t.id));
    const tournamentMap = new Map(publishedTournaments.map(t => [t.id, t]));

    // Filter to only relevant scores and add tournament date
    const relevantScores = playerScores
      .filter(s => s.participated && publishedTournamentIds.has(s.tournamentId))
      .map(s => {
        const tournament = tournamentMap.get(s.tournamentId);
        return {
          ...s,
          tournamentDate: tournament ? new Date(tournament.startDate) : new Date(),
        };
      });

    // Calculate dynamic stats
    const stats2026 = {
      timesPlayed: relevantScores.length,
      timesFinished1st: relevantScores.filter(s => s.position === 1).length,
      timesFinished2nd: relevantScores.filter(s => s.position === 2).length,
      timesFinished3rd: relevantScores.filter(s => s.position === 3).length,
      timesScored36Plus: relevantScores.filter(s => s.scored36Plus).length,
    };
    
    // Calculate points by period
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();
    const seasonStart = getSeasonStart();
    
    const weekScores = relevantScores.filter(s => s.tournamentDate >= weekStart);
    const monthScores = relevantScores.filter(s => s.tournamentDate >= monthStart);
    const seasonScores = relevantScores.filter(s => s.tournamentDate >= seasonStart);
    
    const points = {
      week: weekScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
      month: monthScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
      season: seasonScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
    };

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        data: {
          ...player,
          stats2026,
          points,
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch player';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
