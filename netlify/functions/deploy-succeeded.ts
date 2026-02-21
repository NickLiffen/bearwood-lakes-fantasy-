// Event-triggered function: runs automatically after every successful deploy.
// For deploy previews, seeds the PR-specific database with baseline data.

import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

interface DeployPayload {
  context?: string;
  review_id?: string | number;
  branch?: string;
  deploy_url?: string;
}

export async function handler(event: { body: string }) {
  let payload: DeployPayload;
  try {
    const parsed = JSON.parse(event.body);
    payload = parsed.payload || parsed;
  } catch {
    return { statusCode: 400, body: 'Invalid payload' };
  }

  // Only seed for deploy previews
  if (payload.context !== 'deploy-preview' || !payload.review_id) {
    return { statusCode: 200, body: 'Not a deploy preview — skipping seed.' };
  }

  const reviewId = payload.review_id;
  const dbName = `bearwood-fantasy-pr-${reviewId}`;
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error('[deploy-succeeded] Missing MONGODB_URI');
    return { statusCode: 500, body: 'Missing MONGODB_URI' };
  }

  console.log(`[deploy-succeeded] Seeding PR #${reviewId} database: ${dbName}`);

  const client = await MongoClient.connect(mongoUri);
  const db = client.db(dbName);

  try {
    // Create indexes (same as seed.ts)
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('golfers').createIndex({ isActive: 1 });
    await db.collection('picks').createIndex({ userId: 1, season: 1 }, { unique: true });
    await db.collection('tournaments').createIndex({ status: 1 });
    await db.collection('scores').createIndex({ tournamentId: 1, golferId: 1 }, { unique: true });
    await db.collection('settings').createIndex({ key: 1 }, { unique: true });
    await db.collection('seasons').createIndex({ isActive: 1 });
    await db.collection('seasons').createIndex({ name: 1 }, { unique: true });
    await db.collection('refreshTokens').createIndex({ tokenHash: 1 });
    await db.collection('refreshTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Seed admin user (skip if already exists from a previous deploy)
    const existingAdmin = await db.collection('users').findOne({ username: 'admin' });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      const now = new Date();
      await db.collection('users').insertOne({
        firstName: 'Admin',
        lastName: 'User',
        username: 'admin',
        email: 'admin@bearwoodlakes.com',
        passwordHash,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      });
    }

    // Seed initial settings
    const settings = [{ key: 'transfersOpen', value: false }];
    for (const setting of settings) {
      await db.collection('settings').updateOne(
        { key: setting.key },
        { $setOnInsert: { key: setting.key, value: setting.value, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    // Seed active season
    const existingSeason = await db.collection('seasons').findOne({ name: '2026' });
    if (!existingSeason) {
      await db.collection('seasons').insertOne({
        name: '2026',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-03-30'),
        isActive: true,
        status: 'setup',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    console.log(`[deploy-succeeded] PR #${reviewId} database seeded successfully.`);
    return { statusCode: 200, body: `Seeded ${dbName}` };
  } catch (error) {
    console.error(`[deploy-succeeded] Seed failed for PR #${reviewId}:`, error);
    return { statusCode: 500, body: 'Seed failed' };
  } finally {
    await client.close();
  }
}
