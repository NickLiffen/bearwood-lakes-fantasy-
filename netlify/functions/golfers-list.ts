// GET /.netlify/functions/golfers-list
// Supports pagination: ?page=1&limit=20
// Returns all if no pagination params provided

import { ObjectId } from 'mongodb';
import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from './_shared/models/Golfer';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SCORES_COLLECTION } from './_shared/models/Score';
import { getWeekStart, getMonthStart, getSeasonStart } from './_shared/utils/dates';
import { createPerfTimer } from './_shared/utils/perf';
import { successResponse, successResponseWithMeta, internalError } from './_shared/utils/response';

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

    // First, get published tournaments to build the filter
    const tournaments = await timer.measure('tournaments-query', () =>
      db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
        .find({ status: { $in: ['published', 'complete'] }, season: 2026 })
        .toArray()
    );

    const publishedTournamentIds = tournaments.map(t => t._id);
    const tournamentDateMap = new Map(tournaments.map(t => [t._id.toString(), new Date(t.startDate)]));

    // Use aggregation to fetch golfers with their scores in a single query
    const aggregationPipeline: object[] = [
      // Stage 1: Pagination (if applicable)
      ...(isPaginated ? [
        { $skip: (page - 1) * limit },
        { $limit: limit }
      ] : []),

      // Stage 2: Lookup scores for each golfer (only from published tournaments)
      {
        $lookup: {
          from: SCORES_COLLECTION,
          let: { golferId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$golferId', '$$golferId'] },
                tournamentId: { $in: publishedTournamentIds },
                participated: true
              }
            },
            {
              $project: {
                tournamentId: 1,
                position: 1,
                multipliedPoints: 1,
                scored36Plus: 1
              }
            }
          ],
          as: 'scores'
        }
      }
    ];

    const [golfersWithScores, totalCount] = await timer.measure('aggregation-query', () =>
      Promise.all([
        db.collection<GolferDocument>(GOLFERS_COLLECTION)
          .aggregate(aggregationPipeline)
          .toArray(),
        isPaginated
          ? db.collection<GolferDocument>(GOLFERS_COLLECTION).countDocuments({})
          : Promise.resolve(0)
      ])
    );

    // Process results and calculate stats
    const golfersResult = golfersWithScores.map((doc) => {
      const golferDoc = doc as GolferDocument & { scores: Array<{
        tournamentId: ObjectId;
        position: number | null;
        multipliedPoints: number;
        scored36Plus: boolean;
      }> };

      const golfer = toGolfer(golferDoc);
      const scores = golferDoc.scores || [];

      // Add tournament dates to scores for period filtering
      const scoresWithDates = scores.map(s => ({
        ...s,
        tournamentDate: tournamentDateMap.get(s.tournamentId.toString()) || new Date(0)
      }));

      const stats2026 = {
        timesPlayed: scores.length,
        timesFinished1st: scores.filter(s => s.position === 1).length,
        timesFinished2nd: scores.filter(s => s.position === 2).length,
        timesFinished3rd: scores.filter(s => s.position === 3).length,
        timesScored36Plus: scores.filter(s => s.scored36Plus).length,
      };

      // Calculate points by period
      const weekScores = scoresWithDates.filter(s => s.tournamentDate >= weekStart);
      const monthScores = scoresWithDates.filter(s => s.tournamentDate >= monthStart);
      const seasonScores = scoresWithDates.filter(s => s.tournamentDate >= seasonStart);

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
    if (isPaginated) {
      const pagination = {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      };
      return successResponseWithMeta(golfersResult, { pagination });
    }

    timer.end(JSON.stringify(golfersResult).length);
    return successResponse(golfersResult);
  } catch (error) {
    return internalError(error);
  }
});
