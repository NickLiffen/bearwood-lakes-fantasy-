// Scores validation schemas

import { z } from 'zod';

// Single score entry schema
export const enterScoreSchema = z.object({
  tournamentId: z.string().min(1, 'Tournament ID is required'),
  golferId: z.string().min(1, 'Golfer ID is required'),
  position: z.number().int().min(1).max(100).nullable().optional(),
  scored36Plus: z.boolean().default(false),
  participated: z.boolean().default(true),
});

// Score entry within bulk entry
export const bulkScoreEntrySchema = z.object({
  golferId: z.string().min(1, 'Golfer ID is required'),
  position: z.number().int().min(1).max(100).nullable().optional(),
  scored36Plus: z.boolean().default(false),
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

  // Determine tier based on participant count
  const count = participatingScores.length;
  const tier = count <= 10 ? '0-10' : count < 20 ? '10-20' : '20+';
  
  // Check for required positions
  const hasFirst = participatingScores.some(s => s.position === 1);
  const hasSecond = participatingScores.some(s => s.position === 2);
  const hasThird = participatingScores.some(s => s.position === 3);

  // Rule 2: 0-10 golfers → must have 1st place
  if (tier === '0-10' && !hasFirst) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'With 1-10 golfers, you must assign a 1st place finish',
      path: ['scores'],
    });
    return;
  }

  // Rule 3: 10-20 golfers → must have 1st and 2nd place
  if (tier === '10-20' && (!hasFirst || !hasSecond)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'With 10-20 golfers, you must assign both 1st and 2nd place finishes',
      path: ['scores'],
    });
    return;
  }

  // Rule 4: 20+ golfers → must have 1st, 2nd, and 3rd place
  if (tier === '20+' && (!hasFirst || !hasSecond || !hasThird)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'With 20+ golfers, you must assign 1st, 2nd, and 3rd place finishes',
      path: ['scores'],
    });
    return;
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
