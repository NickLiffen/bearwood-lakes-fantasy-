// GET /.netlify/functions/tournaments-list
// GET /.netlify/functions/tournaments-list?includeResults=true (includes podium and stats)

import type { Handler, HandlerEvent } from '@netlify/functions';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from './_shared/db';
import { getAllTournaments, getTournamentsByStatus } from './_shared/services/tournaments.service';
import { getActiveSeason } from './_shared/services/seasons.service';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { GolferDocument, GOLFERS_COLLECTION } from './_shared/models/Golfer';
import { verifyToken } from './_shared/auth';
import type { Tournament } from '../../shared/types';

interface PodiumGolfer {
  id: string;
  firstName: string;
  lastName: string;
}

interface TournamentWithResults extends Tournament {
  results?: {
    first: PodiumGolfer | null;
    second: PodiumGolfer | null;
    third: PodiumGolfer | null;
    bonusScorerCount: number;
    participantCount: number;
  };
}

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    // Optional auth - admins can see draft tournaments
    let isAdmin = false;
    const authHeader = event.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = verifyToken(token);
        isAdmin = decoded?.role === 'admin';
      } catch {
        // Invalid token, continue as non-admin
      }
    }

    // Check if results should be included
    const includeResults = event.queryStringParameters?.includeResults === 'true';
    // Admin pages pass allSeasons=true to bypass season filtering
    const allSeasons = event.queryStringParameters?.allSeasons === 'true' && isAdmin;

    // Admins requesting all seasons see everything, others see only published/complete
    let tournaments: Tournament[];
    if (isAdmin) {
      tournaments = await getAllTournaments();
    } else {
      const published = await getTournamentsByStatus('published');
      const complete = await getTournamentsByStatus('complete');
      tournaments = [...published, ...complete].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
    }

    // Filter by active season date range (unless admin explicitly requests all seasons)
    if (!allSeasons) {
      const activeSeason = await getActiveSeason();
      if (activeSeason) {
        const seasonStart = new Date(activeSeason.startDate);
        const seasonEnd = new Date(activeSeason.endDate);
        tournaments = tournaments.filter(t => {
          const tStart = new Date(t.startDate);
          return tStart >= seasonStart && tStart <= seasonEnd;
        });
      } else {
        // No active season configured — show nothing to prevent data leakage
        tournaments = [];
      }
    }

    // If includeResults, fetch scores and golfer data for podium
    if (includeResults && tournaments.length > 0) {
      const { db } = await connectToDatabase();

      // Get all tournament IDs
      const tournamentIds = tournaments.map(t => new ObjectId(t.id));

      // Fetch all scores for these tournaments (only podium positions and 36+ check)
      const scores = await db
        .collection<ScoreDocument>(SCORES_COLLECTION)
        .find({
          tournamentId: { $in: tournamentIds },
        })
        .toArray();

      // Get unique golfer IDs from podium scores
      const podiumScores = scores.filter(s => s.position && s.position <= 3);
      const golferIds = [...new Set(podiumScores.map(s => s.golferId.toString()))];

      // Fetch golfers
      const golfers = await db
        .collection<GolferDocument>(GOLFERS_COLLECTION)
        .find({ _id: { $in: golferIds.map(id => new ObjectId(id)) } })
        .toArray();

      // Create golfer lookup
      const golferMap = new Map(
        golfers.map(g => [g._id.toString(), {
          id: g._id.toString(),
          firstName: g.firstName,
          lastName: g.lastName
        }])
      );

      // Group scores by tournament
      const scoresByTournament = new Map<string, ScoreDocument[]>();
      for (const score of scores) {
        const tid = score.tournamentId.toString();
        if (!scoresByTournament.has(tid)) {
          scoresByTournament.set(tid, []);
        }
        scoresByTournament.get(tid)!.push(score);
      }

      // Enhance tournaments with results
      const enhancedTournaments: TournamentWithResults[] = tournaments.map(tournament => {
        const tournamentScores = scoresByTournament.get(tournament.id) || [];

        let first: PodiumGolfer | null = null;
        let second: PodiumGolfer | null = null;
        let third: PodiumGolfer | null = null;
        let bonusScorerCount = 0;
        let participantCount = 0;

        for (const score of tournamentScores) {
          if (score.participated) {
            participantCount++;
          }
          if (score.bonusPoints > 0) {
            bonusScorerCount++;
          }
          if (score.position === 1) {
            first = golferMap.get(score.golferId.toString()) || null;
          } else if (score.position === 2) {
            second = golferMap.get(score.golferId.toString()) || null;
          } else if (score.position === 3) {
            third = golferMap.get(score.golferId.toString()) || null;
          }
        }

        return {
          ...tournament,
          results: {
            first,
            second,
            third,
            bonusScorerCount,
            participantCount,
          },
        };
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: enhancedTournaments,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: tournaments,
      }),
    };
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch tournaments',
      }),
    };
  }
};

export { handler };
