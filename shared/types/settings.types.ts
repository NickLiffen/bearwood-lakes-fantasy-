// Settings domain types

export interface Setting {
  id: string;
  key: string;
  value: unknown;
  updatedAt: Date;
}

// Known settings keys
export type SettingsKey = 'transfersOpen' | 'currentSeason' | 'registrationOpen';

export interface AppSettings {
  transfersOpen: boolean;
  currentSeason: number;
  registrationOpen: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  transfersOpen: false,
  currentSeason: 2026,
  registrationOpen: true,
};
