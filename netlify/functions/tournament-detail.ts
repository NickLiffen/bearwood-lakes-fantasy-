// GET /.netlify/functions/tournament-detail?id={tournamentId}
// Returns a single tournament with its scores and golfer details

import type { Handler, HandlerEvent } from '@netlify/functions';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from './_shared/db';
import { TournamentDocument, TOURNAMENTS_COLLECTION, toTournament } from './_shared/models/Tournament';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { GolferDocument, GOLFERS_COLLECTION } from './_shared/models/Golfer';
import { verifyToken } from './_shared/auth';

interface GolferScore {
  golfer: {
    id: string;
    firstName: string;
    lastName: string;
    picture: string;
  };
  position: number | null;
  participated: boolean;
  rawScore: number | null;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
}

interface PodiumEntry {
  golfer: {
    id: string;
    firstName: string;
    lastName: string;
    picture: string;
  };
  points: number;
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
    const tournamentId = event.queryStringParameters?.id;

    if (!tournamentId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Tournament ID is required' }),
      };
    }

    // Validate ObjectId
    if (!ObjectId.isValid(tournamentId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid tournament ID format' }),
      };
    }

    // Optional auth check - admins can see draft tournaments
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

    const { db } = await connectToDatabase();

    // Get tournament
    const tournament = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .findOne({ _id: new ObjectId(tournamentId) });

    if (!tournament) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Tournament not found' }),
      };
    }

    // Non-admins can only see published or complete tournaments
    if (!isAdmin && tournament.status === 'draft') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, error: 'Tournament not found' }),
      };
    }

    // Get all scores for this tournament
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({ tournamentId: new ObjectId(tournamentId) })
      .toArray();

    // Get all golfers who participated
    const golferIds = scores.map(s => s.golferId);
    const golfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: golferIds } })
      .toArray();

    // Create golfer lookup map
    const golferMap = new Map(golfers.map(g => [g._id.toString(), g]));

    // Build scores with golfer info
    const mappedScores = scores.map(score => {
      const golfer = golferMap.get(score.golferId.toString());
      if (!golfer) return null;

      return {
        golfer: {
          id: golfer._id.toString(),
          firstName: golfer.firstName,
          lastName: golfer.lastName,
          picture: golfer.picture || '',
        },
        position: score.position,
        participated: score.participated,
        rawScore: score.rawScore,
        basePoints: score.basePoints,
        bonusPoints: score.bonusPoints,
        multipliedPoints: score.multipliedPoints,
      };
    });

    // Filter out nulls and sort
    const golferScores: GolferScore[] = mappedScores
      .filter((s): s is GolferScore => s !== null)
      .sort((a, b) => {
        // Sort by position (1, 2, 3 first), then by points, then alphabetically
        if (a.position !== null && b.position !== null) {
          return a.position - b.position;
        }
        if (a.position !== null) return -1;
        if (b.position !== null) return 1;
        if (b.multipliedPoints !== a.multipliedPoints) {
          return b.multipliedPoints - a.multipliedPoints;
        }
        return `${a.golfer.firstName} ${a.golfer.lastName}`.localeCompare(
          `${b.golfer.firstName} ${b.golfer.lastName}`
        );
      });

    // Extract podium
    const podium: {
      first: PodiumEntry | null;
      second: PodiumEntry | null;
      third: PodiumEntry | null;
    } = {
      first: null,
      second: null,
      third: null,
    };

    for (const score of golferScores) {
      if (score.position === 1) {
        podium.first = { golfer: score.golfer, points: score.multipliedPoints };
      } else if (score.position === 2) {
        podium.second = { golfer: score.golfer, points: score.multipliedPoints };
      } else if (score.position === 3) {
        podium.third = { golfer: score.golfer, points: score.multipliedPoints };
      }
    }

    // Calculate stats
    const participatedScores = golferScores.filter(s => s.participated);
    const bonusScorerCount = golferScores.filter(s => s.bonusPoints > 0).length;
    const totalPoints = participatedScores.reduce((sum, s) => sum + s.multipliedPoints, 0);
    const averagePoints = participatedScores.length > 0
      ? Math.round((totalPoints / participatedScores.length) * 10) / 10
      : 0;

    const stats = {
      totalParticipants: participatedScores.length,
      bonusScorers: bonusScorerCount,
      averagePoints,
    };

    // Format tournament
    const tournamentData = toTournament(tournament);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          tournament: {
            ...tournamentData,
            participantCount: tournament.participatingGolferIds?.length || 0,
          },
          podium,
          scores: golferScores,
          stats,
        },
      }),
    };
  } catch (error) {
    console.error('Error fetching tournament detail:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch tournament details',
      }),
    };
  }
};

export { handler };
