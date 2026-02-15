// GET /.netlify/functions/golfers-get?id=xxx

import { withAuth } from './_shared/middleware';
import { getGolferById } from './_shared/services/golfers.service';
import { getAllTournaments } from './_shared/services/tournaments.service';
import { getScoresForGolfer } from './_shared/services/scores.service';
import { getWeekStart, getMonthStart, getSeasonStart } from './_shared/utils/dates';
import { getActiveSeason, getAllSeasons } from './_shared/services/seasons.service';

export const handler = withAuth(async (event) => {
  try {
    const id = event.queryStringParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Golfer ID is required' }),
      };
    }

    const [golfer, tournaments, golferScores, allSeasons] = await Promise.all([
      getGolferById(id),
      getAllTournaments(),
      getScoresForGolfer(id),
      getAllSeasons(),
    ]);

    if (!golfer) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, error: 'Golfer not found' }),
      };
    }

    // Get active season for filtering
    const activeSeason = await getActiveSeason();
    const currentSeason = activeSeason ? (parseInt(activeSeason.name, 10) || new Date().getFullYear()) : new Date().getFullYear();

    // Get published/complete tournaments for current season
    const publishedTournaments = tournaments.filter(
      t => (t.status === 'published' || t.status === 'complete') && t.season === currentSeason
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

    // Compute dynamic per-season stats
    const allPublishedTournaments = tournaments.filter(
      t => t.status === 'published' || t.status === 'complete'
    );

    const seasonStats = [];
    for (const season of allSeasons) {
      const sStart = new Date(season.startDate);
      const sEnd = new Date(season.endDate);

      const seasonTournamentIds = new Set(
        allPublishedTournaments
          .filter(t => {
            const tDate = new Date(t.startDate);
            return tDate >= sStart && tDate <= sEnd;
          })
          .map(t => t.id)
      );

      const seasonGolferScores = golferScores.filter(
        s => seasonTournamentIds.has(s.tournamentId) && s.participated
      );

      if (seasonGolferScores.length === 0 && !season.isActive) continue;

      const totalPoints = seasonGolferScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0);

      seasonStats.push({
        seasonName: season.name,
        isActive: season.isActive,
        startDate: season.startDate,
        endDate: season.endDate,
        timesPlayed: seasonGolferScores.length,
        timesFinished1st: seasonGolferScores.filter(s => s.position === 1).length,
        timesFinished2nd: seasonGolferScores.filter(s => s.position === 2).length,
        timesFinished3rd: seasonGolferScores.filter(s => s.position === 3).length,
        timesScored36Plus: seasonGolferScores.filter(s => s.scored36Plus).length,
        totalPoints,
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        data: {
          ...golfer,
          stats2026,
          points,
          seasonStats,
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
