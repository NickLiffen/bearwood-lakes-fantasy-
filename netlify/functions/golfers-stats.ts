// Get golfer stats from tournament scores

import type { Handler } from '@netlify/functions';
import { getScoresForGolfer } from './_shared/services/scores.service';
import { getAllTournaments } from './_shared/services/tournaments.service';

export interface GolferStats {
  tournamentsPlayed: number;
  totalPoints: number;
  firstPlaceFinishes: number;
  secondPlaceFinishes: number;
  thirdPlaceFinishes: number;
  times36Plus: number;
}

export const handler: Handler = async (event) => {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const golferId = event.queryStringParameters?.golferId;

  if (!golferId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'golferId is required' }),
    };
  }

  try {
    // Get all scores for this golfer
    const scores = await getScoresForGolfer(golferId);
    
    // Get all tournaments to filter for published only (or completed)
    const tournaments = await getAllTournaments();
    const publishedTournamentIds = new Set(
      tournaments
        .filter(t => t.status === 'published' || t.status === 'complete')
        .map(t => t.id)
    );

    // Filter scores to only include those from published/complete tournaments
    const relevantScores = scores.filter(s => 
      s.participated && publishedTournamentIds.has(s.tournamentId)
    );

    // Calculate stats
    const stats: GolferStats = {
      tournamentsPlayed: relevantScores.length,
      totalPoints: relevantScores.reduce((sum, s) => sum + s.multipliedPoints, 0),
      firstPlaceFinishes: relevantScores.filter(s => s.position === 1).length,
      secondPlaceFinishes: relevantScores.filter(s => s.position === 2).length,
      thirdPlaceFinishes: relevantScores.filter(s => s.position === 3).length,
      timesBonusScored: relevantScores.filter(s => s.bonusPoints > 0).length,
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: stats,
      }),
    };
  } catch (error) {
    console.error('Error fetching golfer stats:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch golfer stats' }),
    };
  }
};
