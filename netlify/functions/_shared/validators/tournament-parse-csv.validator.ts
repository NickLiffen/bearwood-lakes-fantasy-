// Tournament CSV parse request validation

import { z } from 'zod';

// 2 MB text limit — tournament CSVs are typically under 50 KB
const MAX_CSV_LENGTH = 2 * 1024 * 1024;

export const tournamentParseCsvSchema = z.object({
  csv: z
    .string()
    .min(1, 'CSV data is required')
    .max(MAX_CSV_LENGTH, `CSV exceeds maximum size of ${MAX_CSV_LENGTH / 1024 / 1024} MB`),
});

export type TournamentParseCsvInput = z.infer<typeof tournamentParseCsvSchema>;
