// GET /.netlify/functions/golfers-list
// Supports pagination: ?page=1&limit=20
// Returns all if no pagination params provided

import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from './_shared/models/Golfer';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { getWeekStart, getMonthStart, getSeasonStart } from './_shared/utils/dates';
import { createPerfTimer } from './_shared/utils/perf';

export const handler = withAuth(async (event: AuthenticatedEvent) => {
  const timer = createPerfTimer('golfers-list');
  
  try {
    const { db } = await timer.measure('db-connect', () => connectToDatabase());
    
    // Parse pagination params
    const queryParams = event.queryStringParameters || {};
    const page = parseInt(queryParams.page || '0', 10);
    const limit = parseInt(queryParams.limit || '0', 10);
    const isPaginated = page > 0 && limit > 0;
    
    // Time boundaries
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();
    const seasonStart = getSeasonStart();

    // Parallelize all data fetching
    const [
      golfersResult,
      totalCount,
      tournaments,
      allScores
    ] = await timer.measure('parallel-queries', () => Promise.all([
      // Get golfers (paginated or all)
      isPaginated 
        ? db.collection<GolferDocument>(GOLFERS_COLLECTION)
            .find({})
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray()
        : db.collection<GolferDocument>(GOLFERS_COLLECTION)
            .find({})
            .toArray(),
      // Get total count for pagination
      isPaginated 
        ? db.collection<GolferDocument>(GOLFERS_COLLECTION).countDocuments({})
        : Promise.resolve(0),
      // Get published tournaments for 2026
      db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
        .find({ status: { $in: ['published', 'complete'] }, season: 2026 })
        .toArray(),
      // Get all scores (we'll filter by golfer IDs if paginated)
      db.collection<ScoreDocument>(SCORES_COLLECTION)
        .find({})
        .toArray(),
    ]), { isPaginated, page, limit });

    const golfers = golfersResult.map(toGolfer);
    const publishedTournamentIds = new Set(tournaments.map(t => t._id.toString()));
    const tournamentMap = new Map(tournaments.map(t => [t._id.toString(), t]));
    
    // Build golfer scores map (filter to paginated golfer IDs for efficiency)
    const golferIds = new Set(golfers.map(g => g.id));
    const golferScoresMap = new Map<string, Array<typeof allScores[0] & { tournamentDate: Date }>>();
    
    for (const score of allScores) {
      if (!publishedTournamentIds.has(score.tournamentId.toString())) continue;
      if (!score.participated) continue;
      
      const golferId = score.golferId.toString();
      // Skip scores for golfers not in current page
      if (isPaginated && !golferIds.has(golferId)) continue;
      
      const tournament = tournamentMap.get(score.tournamentId.toString());
      if (!tournament) continue;
      
      if (!golferScoresMap.has(golferId)) {
        golferScoresMap.set(golferId, []);
      }
      golferScoresMap.get(golferId)!.push({
        ...score,
        tournamentDate: new Date(tournament.startDate),
      });
    }

    // Calculate dynamic stats for each golfer
    const golfersWithStats = golfers.map(golfer => {
      const golferScores = golferScoresMap.get(golfer.id) || [];
      
      const stats2026 = {
        timesPlayed: golferScores.length,
        timesFinished1st: golferScores.filter(s => s.position === 1).length,
        timesFinished2nd: golferScores.filter(s => s.position === 2).length,
        timesFinished3rd: golferScores.filter(s => s.position === 3).length,
        timesScored36Plus: golferScores.filter(s => s.scored36Plus).length,
      };
      
      // Calculate points by period
      const weekScores = golferScores.filter(s => s.tournamentDate >= weekStart);
      const monthScores = golferScores.filter(s => s.tournamentDate >= monthStart);
      const seasonScores = golferScores.filter(s => s.tournamentDate >= seasonStart);
      
      const points = {
        week: weekScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
        month: monthScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
        season: seasonScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
      };

      return {
        ...golfer,
        stats2026,
        points,
      };
    });

    // Return response with pagination info if applicable
    const response: Record<string, unknown> = { 
      success: true, 
      data: golfersWithStats 
    };
    
    if (isPaginated) {
      response.pagination = {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      };
    }

    const body = JSON.stringify(response);
    timer.end(body.length);
    
    return {
      statusCode: 200,
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch golfers';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
