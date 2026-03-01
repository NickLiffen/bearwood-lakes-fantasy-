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

export async function getSettings<T>(keys: string[]): Promise<Map<string, T | null>> {
  const result = new Map<string, T | null>();
  if (keys.length === 0) return result;

  const prefix = settingsCachePrefix();
  const cacheKeys = keys.map((k) => `${prefix}${k}`);
  let missedKeys: string[] = keys;

  // Try Redis mget for all keys at once
  try {
    const redis = getRedisClient();
    const cached = await redis.mget(...cacheKeys);
    missedKeys = [];
    for (let i = 0; i < keys.length; i++) {
      if (cached[i] !== null && cached[i] !== undefined) {
        result.set(keys[i], JSON.parse(cached[i]!) as T);
      } else {
        missedKeys.push(keys[i]);
      }
    }
  } catch {
    // Redis unavailable — fall through to MongoDB for all keys
  }

  if (missedKeys.length === 0) return result;

  // Batch MongoDB query for missed keys
  const { db } = await connectToDatabase();
  const collection = db.collection<SettingDocument>(SETTINGS_COLLECTION);
  const docs = await collection.find({ key: { $in: missedKeys } }).toArray();

  const docMap = new Map(docs.map((d) => [d.key, d.value as T]));

  // Populate results and write back to cache
  const pipeline: Promise<void>[] = [];
  for (const key of missedKeys) {
    const value = docMap.get(key) ?? null;
    result.set(key, value);
    if (value !== null) {
      pipeline.push(
        (async () => {
          try {
            const redis = getRedisClient();
            await redis.set(`${prefix}${key}`, JSON.stringify(value), 'EX', SETTINGS_TTL);
          } catch {
            // Redis unavailable — continue
          }
        })()
      );
    }
  }
  await Promise.all(pipeline);

  return result;
}

export async function getAppSettings(): Promise<AppSettings> {
  const keys = [
    'transfersOpen',
    'registrationOpen',
    'allowNewTeamCreation',
    'maxTransfersPerWeek',
    'maxPlayersPerTransfer',
  ];
  const settings = await getSettings(keys);

  return {
    transfersOpen: (settings.get('transfersOpen') as boolean) ?? false,
    registrationOpen: (settings.get('registrationOpen') as boolean) ?? true,
    allowNewTeamCreation: (settings.get('allowNewTeamCreation') as boolean) ?? true,
    maxTransfersPerWeek: (settings.get('maxTransfersPerWeek') as number) ?? 1,
    maxPlayersPerTransfer: (settings.get('maxPlayersPerTransfer') as number) ?? 6,
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

const APP_SETTINGS_KEY = 'appSettings';

export async function getAppSettingsDoc(): Promise<AppSettings> {
  // Try Redis cache
  try {
    const redis = getRedisClient();
    const cached = await redis.get(`${settingsCachePrefix()}${APP_SETTINGS_KEY}`);
    if (cached) return JSON.parse(cached) as AppSettings;
  } catch {
    /* Redis unavailable */
  }

  // Try consolidated doc in MongoDB
  const { db } = await connectToDatabase();
  const collection = db.collection<SettingDocument>(SETTINGS_COLLECTION);
  const doc = await collection.findOne({ key: APP_SETTINGS_KEY });

  if (doc?.value) {
    const settings = doc.value as AppSettings;
    // Cache it
    try {
      const redis = getRedisClient();
      await redis.set(
        `${settingsCachePrefix()}${APP_SETTINGS_KEY}`,
        JSON.stringify(settings),
        'EX',
        SETTINGS_TTL
      );
    } catch {
      /* Redis unavailable */
    }
    return settings;
  }

  // Fall back to individual keys (backward compat)
  return getAppSettings();
}

export async function setAppSettingsDoc(settings: AppSettings): Promise<void> {
  const { db } = await connectToDatabase();
  const collection = db.collection<SettingDocument>(SETTINGS_COLLECTION);

  await collection.updateOne(
    { key: APP_SETTINGS_KEY },
    { $set: { value: settings, updatedAt: new Date() }, $setOnInsert: { key: APP_SETTINGS_KEY } },
    { upsert: true }
  );

  // Invalidate cache
  try {
    const redis = getRedisClient();
    await redis.del(`${settingsCachePrefix()}${APP_SETTINGS_KEY}`);
  } catch {
    /* Redis unavailable */
  }
}
