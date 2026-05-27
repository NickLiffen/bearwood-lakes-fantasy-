// Tournament upload validation schemas

import { z } from 'zod';
import type { TournamentType, ScoringFormat } from '../../../../shared/types/tournament.types';

const tournamentTypes: [TournamentType, ...TournamentType[]] = [
  'rollup_stableford',
  'weekday_medal',
  'weekend_medal',
  'presidents_cup',
  'founders',
  'club_champs_nett',
];

const scoringFormats: [ScoringFormat, ...ScoringFormat[]] = ['stableford', 'medal'];

const golferEntrySchema = z.object({
  position: z.number().int().min(1, 'Position must be at least 1'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  rawScore: z.number().int(),
  price: z.number().min(0).optional(),
});

export const tournamentUploadSchema = z
  .object({
    name: z.string().min(3, 'Tournament name must be at least 3 characters').max(100),
    date: z
      .string()
      .min(1, 'Date is required')
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    tournamentType: z.enum(tournamentTypes),
    scoringFormat: z.enum(scoringFormats),
    isMultiDay: z.boolean().default(false),
    golfers: z.array(golferEntrySchema).min(1, 'At least one golfer is required'),
  })
  .superRefine((data, ctx) => {
    if (data.scoringFormat !== 'stableford') {
      return;
    }

    data.golfers.forEach((golfer, index) => {
      if (golfer.rawScore < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Raw score must be non-negative for stableford tournaments',
          path: ['golfers', index, 'rawScore'],
        });
      }
    });
  });

export type TournamentUploadInput = z.infer<typeof tournamentUploadSchema>;
export type GolferEntry = z.infer<typeof golferEntrySchema>;
