// MongoDB connection singleton

import { MongoClient, Db } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Get a required environment variable or throw a descriptive error
 */
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Please ensure it is set in your Netlify environment variables or .env.local file.`
    );
  }
  return value;
}

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const mongoUri = getRequiredEnv('MONGODB_URI');
  const dbName = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

  const client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}
