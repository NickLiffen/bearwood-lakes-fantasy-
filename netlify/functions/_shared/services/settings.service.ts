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

  return {
    transfersOpen,
    currentSeason,
    registrationOpen,
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
