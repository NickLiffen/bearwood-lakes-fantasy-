// GET /.netlify/functions/players-list

import { withAuth } from './_shared/middleware';
import { getAllPlayers } from './_shared/services/players.service';
import { getAllTournaments } from './_shared/services/tournaments.service';
import { getAllScores } from './_shared/services/scores.service';

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

export const handler = withAuth(async () => {
  try {
    const [players, tournaments, allScores] = await Promise.all([
      getAllPlayers(),
      getAllTournaments(),
      getAllScores(),
    ]);

    // Get published/complete tournaments for 2026
    const publishedTournaments = tournaments.filter(
      t => (t.status === 'published' || t.status === 'complete') && t.season === 2026
    );
    const publishedTournamentIds = new Set(publishedTournaments.map(t => t.id));
    
    // Create tournament lookup for dates
    const tournamentMap = new Map(publishedTournaments.map(t => [t.id, t]));
    
    // Time boundaries
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();
    const seasonStart = getSeasonStart();

    // Build a map of player scores with tournament info
    const playerScoresMap = new Map<string, Array<typeof allScores[0] & { tournamentDate: Date }>>();
    for (const score of allScores) {
      if (!publishedTournamentIds.has(score.tournamentId)) continue;
      if (!score.participated) continue;
      
      const tournament = tournamentMap.get(score.tournamentId);
      if (!tournament) continue;
      
      const playerId = score.playerId;
      if (!playerScoresMap.has(playerId)) {
        playerScoresMap.set(playerId, []);
      }
      playerScoresMap.get(playerId)!.push({
        ...score,
        tournamentDate: new Date(tournament.startDate),
      });
    }

    // Calculate dynamic stats for each player
    const playersWithStats = players.map(player => {
      const playerScores = playerScoresMap.get(player.id) || [];
      
      const stats2026 = {
        timesPlayed: playerScores.length,
        timesFinished1st: playerScores.filter(s => s.position === 1).length,
        timesFinished2nd: playerScores.filter(s => s.position === 2).length,
        timesFinished3rd: playerScores.filter(s => s.position === 3).length,
        timesScored36Plus: playerScores.filter(s => s.scored36Plus).length,
      };
      
      // Calculate points by period
      const weekScores = playerScores.filter(s => s.tournamentDate >= weekStart);
      const monthScores = playerScores.filter(s => s.tournamentDate >= monthStart);
      const seasonScores = playerScores.filter(s => s.tournamentDate >= seasonStart);
      
      const points = {
        week: weekScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
        month: monthScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
        season: seasonScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
      };

      return {
        ...player,
        stats2026,
        points,
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: playersWithStats }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch players';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
