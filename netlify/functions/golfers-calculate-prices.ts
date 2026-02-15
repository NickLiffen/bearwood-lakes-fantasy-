// POST /.netlify/functions/golfers-calculate-prices (Admin only)

import { withAdmin, apiResponse } from './_shared/middleware';
import { calculateGolferPrices } from './_shared/services/golfers.service';
import { z } from 'zod';

const calculatePricesSchema = z.object({
  season: z.number().int().min(2020).max(new Date().getFullYear() + 5),
});

export const handler = withAdmin(async (event) => {
  if (event.httpMethod !== 'POST') {
    return apiResponse(405, null, 'Method not allowed');
  }

  try {
    const rawBody = JSON.parse(event.body || '{}');
    const data = calculatePricesSchema.parse(rawBody);
    const result = await calculateGolferPrices(data.season);

    return apiResponse(200, result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join('; ');
      return apiResponse(422, null, messages);
    }

    const message = error instanceof Error ? error.message : 'Failed to calculate prices';
    return apiResponse(400, null, message);
  }
});
