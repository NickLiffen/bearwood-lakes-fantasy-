// POST /.netlify/functions/admin-lock-transfers (Admin only)

import type { Handler } from '@netlify/functions';
import { withAdmin, AuthenticatedEvent } from './_shared/middleware';
import { connectToDatabase } from './_shared/db';
import type { TransferWindowStatus } from '../../shared/types';

const SETTINGS_COLLECTION = 'settings';

export const handler: Handler = withAdmin(async (event: AuthenticatedEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(SETTINGS_COLLECTION);

    // Toggle transfer lock status
    const current = await collection.findOne({ key: 'transferWindow' });
    const isLocked = !current?.isLocked;

    await collection.updateOne(
      { key: 'transferWindow' },
      {
        $set: {
          isLocked,
          lockedAt: isLocked ? new Date() : null,
          lockedBy: isLocked ? event.user.userId : null,
        },
      },
      { upsert: true }
    );

    const status: TransferWindowStatus = {
      isLocked,
      lockedAt: isLocked ? new Date() : undefined,
      lockedBy: isLocked ? event.user.userId : undefined,
    };

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: status }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to toggle transfer lock';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
