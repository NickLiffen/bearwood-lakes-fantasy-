// Settings service - manage global settings

import { connectToDatabase } from '../db';
import { SettingDocument, SETTINGS_COLLECTION } from '../models/Settings';
import type { AppSettings } from '../../../../shared/types';

export async function getSetting<T>(key: string): Promise<T | null> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SettingDocument>(SETTINGS_COLLECTION);

  const setting = await collection.findOne({ key });
  return setting ? (setting.value as T) : null;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SettingDocument>(SETTINGS_COLLECTION);

  await collection.updateOne(
    { key },
    {
      $set: { value, updatedAt: new Date() },
      $setOnInsert: { key },
    },
    { upsert: true }
  );
}

export async function getAppSettings(): Promise<AppSettings> {
  const transfersOpen = (await getSetting<boolean>('transfersOpen')) ?? false;
  const currentSeason = (await getSetting<number>('currentSeason')) ?? 2026;
  const registrationOpen = (await getSetting<boolean>('registrationOpen')) ?? true;
  const allowNewTeamCreation = (await getSetting<boolean>('allowNewTeamCreation')) ?? true;
  const seasonStartDate = (await getSetting<string>('seasonStartDate')) ?? '2026-01-01';
  const seasonEndDate = (await getSetting<string>('seasonEndDate')) ?? '2026-12-31';

  return {
    transfersOpen,
    currentSeason,
    registrationOpen,
    allowNewTeamCreation,
    seasonStartDate,
    seasonEndDate,
  };
}

export async function setTransfersOpen(open: boolean): Promise<void> {
  await setSetting('transfersOpen', open);
}

export async function setCurrentSeason(season: number): Promise<void> {
  await setSetting('currentSeason', season);
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  await setSetting('registrationOpen', open);
}

export async function setAllowNewTeamCreation(allow: boolean): Promise<void> {
  await setSetting('allowNewTeamCreation', allow);
}
