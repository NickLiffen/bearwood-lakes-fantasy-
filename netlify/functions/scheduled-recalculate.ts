// Scheduled function: recalculate scores for tournaments flagged for recalculation
// Runs daily via Netlify scheduled functions

import type { Handler } from '@netlify/functions';
import { connectToDatabase } from './_shared/db';
import { TournamentDocument, TOURNAMENTS_COLLECTION } from './_shared/models/Tournament';
import { recalculateScoresForTournament } from './_shared/services/scores.service';
import { createLogger } from './_shared/utils/logger';

const logger = createLogger({ endpoint: 'scheduled-recalculate' });

export const handler: Handler = async () => {
  try {
    const { db } = await connectToDatabase();

    // Find tournaments flagged for recalculation
    const tournaments = await db
      .collection<TournamentDocument>(TOURNAMENTS_COLLECTION)
      .find({ needsRecalculation: true })
      .toArray();

    if (tournaments.length === 0) {
      logger.info('No tournaments need recalculation');
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Nothing to recalculate' }),
      };
    }

    logger.info('Starting recalculation', { count: tournaments.length });

    let totalUpdated = 0;
    for (const tournament of tournaments) {
      const updated = await recalculateScoresForTournament(tournament._id.toString());
      totalUpdated += updated;

      // Clear the flag
      await db.collection<TournamentDocument>(TOURNAMENTS_COLLECTION).updateOne(
        { _id: tournament._id },
        { $set: { needsRecalculation: false, updatedAt: new Date() } }
      );

      logger.info('Recalculated tournament', {
        tournamentId: tournament._id.toString(),
        name: tournament.name,
        scoresUpdated: updated,
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { tournamentsProcessed: tournaments.length, scoresUpdated: totalUpdated },
      }),
    };
  } catch (error) {
    logger.error('Scheduled recalculation failed', error instanceof Error ? error : undefined);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Recalculation failed' }),
    };
  }
};
