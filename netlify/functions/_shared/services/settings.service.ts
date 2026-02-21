// Settings service - manage global settings

import { connectToDatabase } from '../db';
import { getRedisClient, getRedisKeyPrefix } from '../rateLimit';
import { SettingDocument, SETTINGS_COLLECTION } from '../models/Settings';
import type { AppSettings } from '../../../../shared/types';

function settingsCachePrefix(): string {
  return `${getRedisKeyPrefix()}v1:cache:settings:`;
}
const SETTINGS_TTL = 300; // 5 minutes

export async function getSetting<T>(key: string): Promise<T | null> {
  // Try Redis cache first
  try {
    const redis = getRedisClient();
    const cached = await redis.get(`${settingsCachePrefix()}${key}`);
    if (cached !== null && cached !== undefined) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Redis unavailable — fall through to MongoDB
  }

  // Cache miss — query MongoDB
  const { db } = await connectToDatabase();
  const collection = db.collection<SettingDocument>(SETTINGS_COLLECTION);

  const setting = await collection.findOne({ key });
  const value = setting ? (setting.value as T) : null;

  // Write to cache
  if (value !== null) {
    try {
      const redis = getRedisClient();
      await redis.set(`${settingsCachePrefix()}${key}`, JSON.stringify(value), 'EX', SETTINGS_TTL);
    } catch {
      // Redis unavailable — continue
    }
  }

  return value;
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

  // Invalidate cache
  try {
    const redis = getRedisClient();
    await redis.del(`${settingsCachePrefix()}${key}`);
  } catch {
    // Redis unavailable — cache will expire in 5 min
  }
}

export async function getAppSettings(): Promise<AppSettings> {
  const transfersOpen = (await getSetting<boolean>('transfersOpen')) ?? false;
  const registrationOpen = (await getSetting<boolean>('registrationOpen')) ?? true;
  const allowNewTeamCreation = (await getSetting<boolean>('allowNewTeamCreation')) ?? true;
  const maxTransfersPerWeek = (await getSetting<number>('maxTransfersPerWeek')) ?? 1;
  const maxPlayersPerTransfer = (await getSetting<number>('maxPlayersPerTransfer')) ?? 6;

  return {
    transfersOpen,
    registrationOpen,
    allowNewTeamCreation,
    maxTransfersPerWeek,
    maxPlayersPerTransfer,
  };
}

export async function setTransfersOpen(open: boolean): Promise<void> {
  await setSetting('transfersOpen', open);
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  await setSetting('registrationOpen', open);
}

export async function setAllowNewTeamCreation(allow: boolean): Promise<void> {
  await setSetting('allowNewTeamCreation', allow);
}
