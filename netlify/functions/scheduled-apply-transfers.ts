// Scheduled function: apply pending transfers at the gameweek boundary
// Runs every Saturday at 8am via Netlify scheduled functions

import type { Handler } from '@netlify/functions';
import { applyAllPendingChanges } from './_shared/services/picks.service';
import { createLogger } from './_shared/utils/logger';

const logger = createLogger({ endpoint: 'scheduled-apply-transfers' });

export const handler: Handler = async () => {
  try {
    logger.info('Starting bulk application of pending transfers');

    const result = await applyAllPendingChanges();

    if (result.applied === 0) {
      logger.info('No pending transfers to apply');
    } else {
      logger.info('Applied pending transfers', {
        applied: result.applied,
        total: result.total,
      });
      for (const detail of result.details) {
        logger.info('Applied transfer', {
          userId: detail.userId,
          pendingChangedAt: detail.pendingChangedAt.toISOString(),
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { applied: result.applied, total: result.total },
      }),
    };
  } catch (error) {
    logger.error(
      'Scheduled transfer application failed',
      error instanceof Error ? error : undefined
    );
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Transfer application failed' }),
    };
  }
};
