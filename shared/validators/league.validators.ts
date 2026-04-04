// League validation schemas

import { z } from 'zod';

export const createLeagueSchema = z.object({
  name: z
    .string()
    .min(1, 'League name is required')
    .max(50, 'League name must be 50 characters or less'),
  description: z
    .string()
    .max(200, 'Description must be 200 characters or less')
    .optional()
    .default(''),
});

export const updateLeagueSchema = z.object({
  id: z.string().min(1, 'League ID is required'),
  name: z
    .string()
    .min(1, 'League name is required')
    .max(50, 'League name must be 50 characters or less')
    .optional(),
  description: z.string().max(200, 'Description must be 200 characters or less').optional(),
});

export const joinLeagueSchema = z.object({
  inviteCode: z.string().length(6, 'Invite code must be 6 characters'),
});

export const leagueIdSchema = z.object({
  leagueId: z.string().min(1, 'League ID is required'),
});

export const removeMemberSchema = z.object({
  leagueId: z.string().min(1, 'League ID is required'),
  userId: z.string().min(1, 'User ID is required'),
});

export const transferAdminSchema = z.object({
  leagueId: z.string().min(1, 'League ID is required'),
  newAdminId: z.string().min(1, 'New admin ID is required'),
});

// Type exports
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
export type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>;
export type JoinLeagueInput = z.infer<typeof joinLeagueSchema>;
export type LeagueIdInput = z.infer<typeof leagueIdSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
export type TransferAdminInput = z.infer<typeof transferAdminSchema>;
