// Scores validation schemas

import { z } from 'zod';

// Single score entry schema
export const enterScoreSchema = z.object({
  tournamentId: z.string().min(1, 'Tournament ID is required'),
  golferId: z.string().min(1, 'Golfer ID is required'),
  position: z.number().int().min(1).max(100).nullable().optional(),
  rawScore: z.number().int().nullable().optional(),
  participated: z.boolean().default(true),
});

// Score entry within bulk entry
export const bulkScoreEntrySchema = z.object({
  golferId: z.string().min(1, 'Golfer ID is required'),
  position: z.number().int().min(1).max(100).nullable().optional(),
  rawScore: z.number().int().nullable().optional(),
  participated: z.boolean().default(false),
});

// Bulk scores entry schema
export const bulkEnterScoresSchema = z.object({
  tournamentId: z.string().min(1, 'Tournament ID is required'),
  scores: z.array(bulkScoreEntrySchema).min(1, 'At least one score is required'),
}).superRefine((data, ctx) => {
  const participatingScores = data.scores.filter(s => s.participated);
  
  // Rule 1: At least 1 golfer must have participated
  if (participatingScores.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one golfer must have participated',
      path: ['scores'],
    });
    return;
  }

  // Rule 2: All participating golfers must have a rawScore
  const missingScores = participatingScores.filter(
    s => s.rawScore === null || s.rawScore === undefined
  );
  if (missingScores.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'All participating golfers must have a raw score entered',
      path: ['scores'],
    });
    return;
  }

  // Rule 3: Must have at least 1st place assigned
  const hasFirst = participatingScores.some(s => s.position === 1);
  if (!hasFirst) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'You must assign a 1st place finish',
      path: ['scores'],
    });
    return;
  }

  // Rule 4: If 2+ participants, must have 2nd place
  if (participatingScores.length >= 2) {
    const hasSecond = participatingScores.some(s => s.position === 2);
    if (!hasSecond) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'With 2+ golfers, you must assign a 2nd place finish',
        path: ['scores'],
      });
      return;
    }
  }

  // Rule 5: If 3+ participants, must have 3rd place
  if (participatingScores.length >= 3) {
    const hasThird = participatingScores.some(s => s.position === 3);
    if (!hasThird) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'With 3+ golfers, you must assign a 3rd place finish',
        path: ['scores'],
      });
      return;
    }
  }

  // Check for duplicate positions (only for positions 1, 2, 3)
  const podiumPositions = participatingScores
    .filter(s => s.position !== null && s.position !== undefined && s.position >= 1 && s.position <= 3)
    .map(s => s.position);
  const uniquePositions = new Set(podiumPositions);
  
  if (podiumPositions.length !== uniquePositions.size) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Duplicate positions found. Each position (1st, 2nd, 3rd) can only be assigned once',
      path: ['scores'],
    });
  }
});

// Type exports
export type EnterScoreInput = z.infer<typeof enterScoreSchema>;
export type BulkScoreEntry = z.infer<typeof bulkScoreEntrySchema>;
export type BulkEnterScoresInput = z.infer<typeof bulkEnterScoresSchema>;
