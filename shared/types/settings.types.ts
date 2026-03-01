// Settings domain types

export interface Setting {
  id: string;
  key: string;
  value: unknown;
  updatedAt: Date;
}

// Known settings keys
export type SettingsKey =
  | 'transfersOpen'
  | 'registrationOpen'
  | 'allowNewTeamCreation'
  | 'maxTransfersPerWeek'
  | 'maxPlayersPerTransfer';

export interface AppSettings {
  transfersOpen: boolean;
  registrationOpen: boolean;
  allowNewTeamCreation: boolean;
  maxTransfersPerWeek: number; // Max transfers allowed per week (when transfers are open)
  maxPlayersPerTransfer: number; // Max golfers that can be swapped in a single transfer
}

export const DEFAULT_SETTINGS: AppSettings = {
  transfersOpen: false,
  registrationOpen: true,
  allowNewTeamCreation: true,
  maxTransfersPerWeek: 1,
  maxPlayersPerTransfer: 6, // Default: can swap entire team
};
