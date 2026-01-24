// DELETE /.netlify/functions/settings-reset (Admin only)
// Danger zone actions - reset scores, picks, etc.

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import { SCORES_COLLECTION } from './_shared/models/Score';
import { PICKS_COLLECTION } from './_shared/models/Pick';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, confirm } = body;

    if (confirm !== 'CONFIRM') {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Must send confirm: "CONFIRM" to proceed' }),
      };
    }

    const { db } = await connectToDatabase();

    switch (action) {
      case 'reset-scores': {
        // Delete all scores
        const scoresCollection = db.collection(SCORES_COLLECTION);
        const result = await scoresCollection.deleteMany({});
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            data: { message: `Deleted ${result.deletedCount} scores` },
          }),
        };
      }

      case 'reset-picks': {
        // Delete all picks
        const picksCollection = db.collection(PICKS_COLLECTION);
        const result = await picksCollection.deleteMany({});
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            data: { message: `Deleted ${result.deletedCount} user picks` },
          }),
        };
      }

      case 'reset-all': {
        // Delete both scores and picks
        const scoresCollection = db.collection(SCORES_COLLECTION);
        const picksCollection = db.collection(PICKS_COLLECTION);
        
        const [scoresResult, picksResult] = await Promise.all([
          scoresCollection.deleteMany({}),
          picksCollection.deleteMany({}),
        ]);

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            data: {
              message: `Reset complete: ${scoresResult.deletedCount} scores and ${picksResult.deletedCount} picks deleted`,
            },
          }),
        };
      }

      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to perform reset';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
