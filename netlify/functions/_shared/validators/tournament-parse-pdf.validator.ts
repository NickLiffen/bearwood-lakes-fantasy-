// Tournament PDF parse request validation

import { z } from 'zod';

// 5 MB base64 limit (~3.75 MB decoded) — ECG leaderboard PDFs are typically ~50 KB
const MAX_BASE64_LENGTH = 5 * 1024 * 1024;

export const tournamentParsePdfSchema = z.object({
  pdf: z
    .string()
    .min(1, 'PDF data is required')
    .max(MAX_BASE64_LENGTH, `PDF exceeds maximum size of ${MAX_BASE64_LENGTH / 1024 / 1024} MB`),
});

export type TournamentParsePdfInput = z.infer<typeof tournamentParsePdfSchema>;
