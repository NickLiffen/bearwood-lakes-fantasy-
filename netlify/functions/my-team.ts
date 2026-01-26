// GET /.netlify/functions/my-team
// Returns user's team with detailed stats including weekly/monthly/season breakdowns

import type { Handler } from '@netlify/functions';
import { ObjectId } from 'mongodb';
import { withAuth, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { PickDocument, PICKS_COLLECTION } from './_shared/models/Pick';
import { PlayerDocument, PLAYERS_COLLECTION, toPlayer } from './_shared/models/Player';
import { ScoreDocument, SCORES_COLLECTION } from './_shared/models/Score';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { SettingDocument, SETTINGS_COLLECTION } from './_shared/models/Settings';

interface PlayerWithScores {
  player: ReturnType<typeof toPlayer>;
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

// Get the start of the current week (Monday 00:00)
function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Calculate days since last Monday
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0); // Midnight
  
  return weekStart;
}

// Get the start of the current month
function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

// Get the start of 2026 season
function getSeasonStart(): Date {
  return new Date(2026, 0, 1, 0, 0, 0, 0); // January 1, 2026
}

export const handler: Handler = withAuth(async (event: AuthenticatedEvent) => {
  try {
    const { db } = await connectToDatabase();
    
    // Get current season setting
    const seasonSetting = await db
      .collection<SettingDocument>(SETTINGS_COLLECTION)
      .findOne({ key: 'currentSeason' });
    const currentSeason = (seasonSetting?.value as number) || 2026;
    
    // Get transfers open setting
    const transfersSetting = await db
      .collection<SettingDocument>(SETTINGS_COLLECTION)
      .findOne({ key: 'transfersOpen' });
    const transfersOpen = (transfersSetting?.value as boolean) || false;
    
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
            team: null,
          },
        }),
      };
    }
    
    // Get players for this pick
    const playerIds = pick.playerIds.map((id) => new ObjectId(id));
    const players = await db
      .collection<PlayerDocument>(PLAYERS_COLLECTION)
      .find({ _id: { $in: playerIds } })
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
    
    // Get all scores for these players from published 2026 tournaments
    const scores = await db
      .collection<ScoreDocument>(SCORES_COLLECTION)
      .find({
        playerId: { $in: playerIds },
        tournamentId: { $in: publishedTournamentIds },
      })
      .toArray();
    
    // Build player scores map
    const playerScoresMap = new Map<string, ScoreDocument[]>();
    for (const score of scores) {
      const playerId = score.playerId.toString();
      if (!playerScoresMap.has(playerId)) {
        playerScoresMap.set(playerId, []);
      }
      playerScoresMap.get(playerId)!.push(score);
    }
    
    // Time boundaries
    const weekStart = getWeekStart();
    const monthStart = getMonthStart();
    const seasonStart = getSeasonStart();
    
    // Build player data with scores
    const playersWithScores: PlayerWithScores[] = players.map((player) => {
      const playerScores = playerScoresMap.get(player._id.toString()) || [];
      
      // Format scores with tournament info
      const formattedScores = playerScores.map((score) => {
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
        player: toPlayer(player),
        weekPoints,
        monthPoints,
        seasonPoints,
        weekScores,
        monthScores,
        seasonScores,
      };
    });
    
    // Sort by season points descending
    playersWithScores.sort((a, b) => b.seasonPoints - a.seasonPoints);
    
    // Calculate team totals
    const teamTotals = {
      weekPoints: playersWithScores.reduce((sum, p) => sum + p.weekPoints, 0),
      monthPoints: playersWithScores.reduce((sum, p) => sum + p.monthPoints, 0),
      seasonPoints: playersWithScores.reduce((sum, p) => sum + p.seasonPoints, 0),
      totalSpent: pick.totalSpent,
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          hasTeam: true,
          transfersOpen,
          team: {
            players: playersWithScores,
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
