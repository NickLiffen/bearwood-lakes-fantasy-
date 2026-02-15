// Season upload validation schemas

import { z } from 'zod';

export const seasonUploadSchema = z.object({
  csvText: z.string().min(1, 'CSV text is required'),
});

export type SeasonUploadInput = z.infer<typeof seasonUploadSchema>;
