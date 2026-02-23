// GET /.netlify/functions/golfers-list
// Supports pagination: ?page=1&limit=20
// Returns all if no pagination params provided

import { ObjectId } from 'mongodb';
import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from './_shared/models/Golfer';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SCORES_COLLECTION } from './_shared/models/Score';
import { PICKS_COLLECTION } from './_shared/models/Pick';
import { SeasonDocument, SEASONS_COLLECTION } from './_shared/models/Season';
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
    const seasonParam = queryParams.season; // e.g., "2025"

    // Time boundaries
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();
    const seasonStart = getSeasonStart();

    // First, get published tournaments and seasons
    const [allPublishedTournaments, allSeasons] = await timer.measure('tournaments-query', () =>
      Promise.all([
        db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
          .find({ status: { $in: ['published', 'complete'] } })
          .toArray(),
        db.collection<SeasonDocument>(SEASONS_COLLECTION)
          .find({}).sort({ startDate: -1 }).toArray(),
      ])
    );

    // Separate 2026 tournaments for existing stats
    const tournaments2026 = allPublishedTournaments.filter(t => t.season === 2026);
    const tournament2026IdSet = new Set(tournaments2026.map(t => t._id.toString()));

    const publishedTournamentIds = allPublishedTournaments.map(t => t._id);
    const tournamentDateMap = new Map(allPublishedTournaments.map(t => [t._id.toString(), new Date(t.startDate)]));

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
                bonusPoints: 1,
                rawScore: 1
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

    // Pre-compute season → tournament IDs mapping
    const seasonTournamentMap = new Map<string, Set<string>>();
    for (const season of allSeasons) {
      const seasonStart = new Date(season.startDate);
      const seasonEnd = new Date(season.endDate);
      const ids = new Set(
        allPublishedTournaments
          .filter(t => {
            const d = new Date(t.startDate);
            return d >= seasonStart && d <= seasonEnd;
          })
          .map(t => t._id.toString())
      );
      seasonTournamentMap.set(season.name, ids);
    }

    // Calculate ownership percentages from active season picks
    const activeSeason = allSeasons.find(s => s.isActive);
    const activeSeasonNumber = activeSeason ? parseInt(activeSeason.name) || 0 : 0;
    const useOwnership = !seasonParam || seasonParam === 'overall' || seasonParam === activeSeason?.name;

    const ownershipMap = new Map<string, number>();
    let totalPicks = 0;

    if (useOwnership && activeSeasonNumber > 0) {
      const picks = await db.collection(PICKS_COLLECTION)
        .find({ season: activeSeasonNumber })
        .toArray();
      totalPicks = picks.length;

      for (const pick of picks) {
        const golferIds: ObjectId[] = (pick.golferIds as ObjectId[]) || [];
        for (const gId of golferIds) {
          const key = gId.toString();
          ownershipMap.set(key, (ownershipMap.get(key) || 0) + 1);
        }
      }
    }

    // Process results and calculate stats
    const golfersResult = golfersWithScores.map((doc) => {
      const golferDoc = doc as GolferDocument & { scores: Array<{
        tournamentId: ObjectId;
        position: number | null;
        multipliedPoints: number;
        bonusPoints: number;
        rawScore: number | null;
      }> };

      const golfer = toGolfer(golferDoc);
      const scores = golferDoc.scores || [];

      // Add tournament dates to ALL scores for period filtering
      const scoresWithDates = scores.map(s => ({
        ...s,
        rawScore: s.rawScore,
        tournamentDate: tournamentDateMap.get(s.tournamentId.toString()) || new Date(0)
      }));

      // Filter to 2026 scores for existing stats
      const scores2026 = scoresWithDates.filter(s => tournament2026IdSet.has(s.tournamentId.toString()));

      const stats2026 = {
        timesPlayed: scores2026.length,
        timesFinished1st: scores2026.filter(s => s.position === 1).length,
        timesFinished2nd: scores2026.filter(s => s.position === 2).length,
        timesFinished3rd: scores2026.filter(s => s.position === 3).length,
        timesScored36Plus: scores2026.filter(s => (s.rawScore ?? 0) >= 36).length,
        timesScored32Plus: scores2026.filter(s => (s.rawScore ?? 0) >= 32).length,
      };

      // Calculate points by period
      let weekScores, monthScores, seasonScores;

      if (seasonParam === 'overall') {
        // Overall: all scores, week/month relative to latest tournament date globally
        const globalLatest = scoresWithDates.length > 0
          ? scoresWithDates.reduce((latest, s) =>
              s.tournamentDate > latest ? s.tournamentDate : latest, scoresWithDates[0].tournamentDate)
          : new Date();
        const overallWeekStart = getWeekStart(globalLatest);
        const overallMonthStart = getMonthStart(globalLatest);
        weekScores = scoresWithDates.filter(s => s.tournamentDate >= overallWeekStart);
        monthScores = scoresWithDates.filter(s => s.tournamentDate >= overallMonthStart);
        seasonScores = scoresWithDates;
      } else if (seasonParam) {
        const matchedSeason = allSeasons.find(s => s.name === seasonParam);
        if (matchedSeason) {
          const sStart = new Date(matchedSeason.startDate);
          const sEnd = new Date(matchedSeason.endDate);
          const seasonFilteredScores = scoresWithDates.filter(
            s => s.tournamentDate >= sStart && s.tournamentDate <= sEnd
          );
          // Use the latest tournament date in this season as reference for week/month
          const latestDate = seasonFilteredScores.length > 0
            ? seasonFilteredScores.reduce((latest, s) =>
                s.tournamentDate > latest ? s.tournamentDate : latest, seasonFilteredScores[0].tournamentDate)
            : sEnd;
          const seasonWeekStart = getWeekStart(latestDate);
          const seasonMonthStart = getMonthStart(latestDate);
          weekScores = seasonFilteredScores.filter(s => s.tournamentDate >= seasonWeekStart);
          monthScores = seasonFilteredScores.filter(s => s.tournamentDate >= seasonMonthStart);
          seasonScores = seasonFilteredScores;
        } else {
          weekScores = scoresWithDates.filter(s => s.tournamentDate >= weekStart);
          monthScores = scoresWithDates.filter(s => s.tournamentDate >= monthStart);
          seasonScores = scoresWithDates.filter(s => s.tournamentDate >= seasonStart);
        }
      } else {
        weekScores = scoresWithDates.filter(s => s.tournamentDate >= weekStart);
        monthScores = scoresWithDates.filter(s => s.tournamentDate >= monthStart);
        seasonScores = scoresWithDates.filter(s => s.tournamentDate >= seasonStart);
      }

      const points = {
        week: weekScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
        month: monthScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
        season: seasonScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0),
      };

      // Compute dynamic per-season stats
      const seasonStats = [];
      for (const season of allSeasons) {
        const seasonTournamentIds = seasonTournamentMap.get(season.name) || new Set<string>();

        const seasonGolferScores = scores.filter(
          s => seasonTournamentIds.has(s.tournamentId.toString())
        );

        if (seasonGolferScores.length === 0 && !season.isActive) continue;

        const totalPoints = seasonGolferScores.reduce(
          (sum, s) => sum + (s.multipliedPoints || 0), 0
        );

        seasonStats.push({
          seasonName: season.name,
          isActive: season.isActive,
          startDate: season.startDate,
          endDate: season.endDate,
          timesPlayed: seasonGolferScores.length,
          timesFinished1st: seasonGolferScores.filter(s => s.position === 1).length,
          timesFinished2nd: seasonGolferScores.filter(s => s.position === 2).length,
          timesFinished3rd: seasonGolferScores.filter(s => s.position === 3).length,
          timesScored36Plus: seasonGolferScores.filter(s => (s.rawScore ?? 0) >= 36).length,
          timesScored32Plus: seasonGolferScores.filter(s => (s.rawScore ?? 0) >= 32).length,
          totalPoints,
        });
      }

      // Calculate ownership percentage
      const pickCount = ownershipMap.get(golfer.id) || 0;
      const selectedPercentage = totalPicks > 0
        ? Math.round((pickCount / totalPicks) * 100)
        : 0;

      return {
        ...golfer,
        stats2026,
        points,
        seasonStats,
        selectedPercentage,
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
