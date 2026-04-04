// Migration script: Update 2026 season with firstGameweekStart (Friday April 3rd 8am)
// Run with: npx tsx scripts/migrate-gw1-friday.ts

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load .env.local first (production), then .env as fallback
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI environment variable');
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB || 'bearwood-fantasy';
  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);

  console.log(`Connected to database: ${dbName}`);

  // Store as local time (consistent with how the app uses setHours(8,0,0,0) everywhere)
  const firstGameweekStart = new Date(2026, 3, 3, 8, 0, 0); // Fri Apr 3, 2026 8am local

  const result = await db
    .collection('seasons')
    .updateOne({ name: '2026' }, { $set: { firstGameweekStart, updatedAt: new Date() } });

  if (result.matchedCount === 0) {
    console.error('No 2026 season found in the database.');
  } else if (result.modifiedCount === 0) {
    console.log('2026 season already has firstGameweekStart set.');
  } else {
    console.log(
      `✅ Updated 2026 season with firstGameweekStart: ${firstGameweekStart.toISOString()}`
    );
  }

  // Verify
  const season = await db.collection('seasons').findOne({ name: '2026' });
  console.log('Current 2026 season record:', JSON.stringify(season, null, 2));

  await client.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
