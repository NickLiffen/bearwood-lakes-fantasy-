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
  rawScore: z.number().int().min(0, 'Raw score must be non-negative'),
});

export const tournamentUploadSchema = z.object({
  name: z.string().min(3, 'Tournament name must be at least 3 characters').max(100),
  date: z.string().min(1, 'Date is required'),
  tournamentType: z.enum(tournamentTypes),
  scoringFormat: z.enum(scoringFormats),
  isMultiDay: z.boolean().default(false),
  golfers: z.array(golferEntrySchema).min(1, 'At least one golfer is required'),
});

export type TournamentUploadInput = z.infer<typeof tournamentUploadSchema>;
export type GolferEntry = z.infer<typeof golferEntrySchema>;
