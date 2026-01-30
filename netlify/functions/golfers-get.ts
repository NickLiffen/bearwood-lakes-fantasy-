// GET /.netlify/functions/golfers-get?id=xxx

import { withAuth } from './_shared/middleware';
import { getGolferById } from './_shared/services/golfers.service';
import { getAllTournaments } from './_shared/services/tournaments.service';
import { getScoresForGolfer } from './_shared/services/scores.service';
import { getWeekStart, getMonthStart, getSeasonStart } from './_shared/utils/dates';

export const handler = withAuth(async (event) => {
  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Golfer ID is required' }),
      };
    }

    const [golfer, tournaments, golferScores] = await Promise.all([
      getGolferById(id),
      getAllTournaments(),
      getScoresForGolfer(id),
    ]);

    if (!golfer) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Golfer not found' }),
      };
    }

    // Get published/complete tournaments for 2026
    const publishedTournaments = tournaments.filter(
      t => (t.status === 'published' || t.status === 'complete') && t.season === 2026
    );
    const publishedTournamentIds = new Set(publishedTournaments.map(t => t.id));
    const tournamentMap = new Map(publishedTournaments.map(t => [t.id, t]));

    // Filter to only relevant scores and add tournament date
    const relevantScores = golferScores
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
          ...golfer,
          stats2026,
          points,
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch golfer';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
