// GET /.netlify/functions/my-team
// Returns user's team with detailed stats including weekly/monthly/season breakdowns

import type { Handler } from '@netlify/functions';
import { ObjectId } from 'mongodb';
import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { GolferDocument, GOLFERS_COLLECTION, toGolfer } from './_shared/models/Golfer';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from './_shared/models/Settings';
import { getWeekStart, getMonthStart, getSeasonStart } from './_shared/utils/dates';

interface GolferWithScores {
  golfer: ReturnType<typeof toGolfer>;
  weekPoints: number;
  monthPoints: number;
  seasonPoints: number;
  weekScores: Array<{
    tournamentId: string;
    tournamentName: string;
    position: number | null;
    basePoints: number;
    bonusPoints: number;
    multipliedPoints: number;
    scored36Plus: boolean;
    participated: boolean;
    tournamentDate: Date;
  }>;
  monthScores: Array<{
    tournamentId: string;
    tournamentName: string;
    position: number | null;
    basePoints: number;
    bonusPoints: number;
    multipliedPoints: number;
    scored36Plus: boolean;
    participated: boolean;
    tournamentDate: Date;
  }>;
  seasonScores: Array<{
    tournamentId: string;
    tournamentName: string;
    position: number | null;
    basePoints: number;
    bonusPoints: number;
    multipliedPoints: number;
    scored36Plus: boolean;
    participated: boolean;
    tournamentDate: Date;
  }>;
}

export const handler: Handler = withAuth(async (event: AuthenticatedEvent) => {
  try {
    const { db } = await connectToDatabase();
    
    // Parallelize all settings queries for faster response
    const [seasonSetting, transfersSetting, newTeamSetting] = await Promise.all([
      db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'currentSeason' }),
      db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'transfersOpen' }),
      db.collection<SettingDocument>(SETTINGS_COLLECTION).findOne({ key: 'allowNewTeamCreation' }),
    ]);
    
    const currentSeason = (seasonSetting?.value as number) || 2026;
    const transfersOpen = (transfersSetting?.value as boolean) || false;
    const allowNewTeamCreation = (newTeamSetting?.value as boolean) ?? true;
    
    // Get user's picks for current season
    const pick = await db
      .collection<PickDocument>(PICKS_COLLECTION)
      .findOne({
        userId: new ObjectId(event.user.userId),
        season: currentSeason,
      });
    
    if (!pick) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          data: {
            hasTeam: false,
            transfersOpen,
            allowNewTeamCreation,
            team: null,
          },
        }),
      };
    }
    
    // Get golfers for this pick
    const golferIds = pick.golferIds.map((id) => new ObjectId(id));
    const golfers = await db
      .collection<GolferDocument>(GOLFERS_COLLECTION)
      .find({ _id: { $in: golferIds } })
      .toArray();
    
    // Get published or complete tournaments for current season
    const publishedTournaments = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({ 
        status: { $in: ['published', 'complete'] }, 
        season: currentSeason 
      })
      .toArray();
    
    const tournamentMap = new Map(
      publishedTournaments.map((t) => [t._id.toString(), t])
    );
    const publishedTournamentIds = publishedTournaments.map((t) => t._id);
    
    // Get all scores for these golfers from published 2026 tournaments
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({
        golferId: { $in: golferIds },
        tournamentId: { $in: publishedTournamentIds },
      })
      .toArray();
    
    // Build golfer scores map
    const golferScoresMap = new Map<string, ScoreDocument[]>();
    for (const score of scores) {
      const golferId = score.golferId.toString();
      if (!golferScoresMap.has(golferId)) {
        golferScoresMap.set(golferId, []);
      }
      golferScoresMap.get(golferId)!.push(score);
    }
    
    // Time boundaries
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();
    const seasonStart = getSeasonStart();
    
    // Build golfer data with scores
    const golfersWithScores: GolferWithScores[] = golfers.map((golfer) => {
      const golferScores = golferScoresMap.get(golfer._id.toString()) || [];
      
      // Format scores with tournament info
      const formattedScores = golferScores.map((score) => {
        const tournament = tournamentMap.get(score.tournamentId.toString());
        return {
          tournamentId: score.tournamentId.toString(),
          tournamentName: tournament?.name || 'Unknown Tournament',
          position: score.position,
          basePoints: score.basePoints,
          bonusPoints: score.bonusPoints,
          multipliedPoints: score.multipliedPoints,
          scored36Plus: score.scored36Plus,
          participated: score.participated,
          tournamentDate: tournament?.startDate || new Date(),
        };
      }).sort((a, b) => new Date(b.tournamentDate).getTime() - new Date(a.tournamentDate).getTime());
      
      // Filter by time period
      const weekScores = formattedScores.filter((s) => new Date(s.tournamentDate) >= weekStart);
      const monthScores = formattedScores.filter((s) => new Date(s.tournamentDate) >= monthStart);
      const seasonScores = formattedScores.filter((s) => new Date(s.tournamentDate) >= seasonStart);
      
      // Calculate totals
      const weekPoints = weekScores.reduce((sum, s) => sum + s.multipliedPoints, 0);
      const monthPoints = monthScores.reduce((sum, s) => sum + s.multipliedPoints, 0);
      const seasonPoints = seasonScores.reduce((sum, s) => sum + s.multipliedPoints, 0);
      
      return {
        golfer: toGolfer(golfer),
        weekPoints,
        monthPoints,
        seasonPoints,
        weekScores,
        monthScores,
        seasonScores,
      };
    });
    
    // Sort by season points descending
    golfersWithScores.sort((a, b) => b.seasonPoints - a.seasonPoints);
    
    // Calculate team totals
    const teamTotals = {
      weekPoints: golfersWithScores.reduce((sum, g) => sum + g.weekPoints, 0),
      monthPoints: golfersWithScores.reduce((sum, g) => sum + g.monthPoints, 0),
      seasonPoints: golfersWithScores.reduce((sum, g) => sum + g.seasonPoints, 0),
      totalSpent: pick.totalSpent,
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          hasTeam: true,
          transfersOpen,
          allowNewTeamCreation,
          team: {
            golfers: golfersWithScores,
            totals: teamTotals,
            weekStart: weekStart.toISOString(),
            monthStart: monthStart.toISOString(),
            seasonStart: seasonStart.toISOString(),
            createdAt: pick.createdAt,
            updatedAt: pick.updatedAt,
          },
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch team';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
