// POST /.netlify/functions/admin-apply-transfers (Admin only)
// Manually triggers bulk application of pending transfers
// Use this to fix missed transfer applications or apply transfers immediately

import type { Handler } from '@netlify/functions';
import { withAdmin } from './_shared/middleware';
import { applyAllPendingChanges } from './_shared/services/picks.service';

export const handler: Handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const result = await applyAllPendingChanges();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          applied: result.applied,
          total: result.total,
          details: result.details.map((d) => ({
            userId: d.userId,
            pendingChangedAt: d.pendingChangedAt.toISOString(),
          })),
          message:
            result.applied > 0
              ? `Applied ${result.applied} pending transfer(s)`
              : 'No pending transfers to apply',
        },
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to apply transfers';
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: message }),
    };
  }
});
