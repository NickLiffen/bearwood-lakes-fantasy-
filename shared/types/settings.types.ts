// Settings domain types

export interface Setting {
  id: string;
  key: string;
  value: unknown;
  updatedAt: Date;
}

// Known settings keys
export type SettingsKey = 'transfersOpen' | 'currentSeason' | 'registrationOpen' | 'allowNewTeamCreation' | 'seasonStartDate' | 'seasonEndDate';

export interface AppSettings {
  transfersOpen: boolean;
  currentSeason: number;
  registrationOpen: boolean;
  allowNewTeamCreation: boolean;
  seasonStartDate: string; // ISO date string
  seasonEndDate: string;   // ISO date string
}

export const DEFAULT_SETTINGS: AppSettings = {
  transfersOpen: false,
  currentSeason: 2026,
  registrationOpen: true,
  allowNewTeamCreation: true,
  seasonStartDate: '2026-01-01',
  seasonEndDate: '2026-12-31',
};
