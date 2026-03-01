// One-time cleanup: remove surrounding quotes from golfer names and tournament names
// Run with: npx tsx scripts/cleanup-quotes.ts

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

function stripQuotes(value: string): string {
  let cleaned = value;
  // Remove leading quote
  if (cleaned.startsWith('"')) {
    cleaned = cleaned.slice(1);
  }
  // Remove trailing quote
  if (cleaned.endsWith('"')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned.trim();
}

async function cleanup() {
  console.log('🧹 Cleaning up quotes from golfer names and tournament names...\n');

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    // Fix golfer names
    const golfers = await db.collection('golfers').find({}).toArray();
    let golfersFixed = 0;

    for (const golfer of golfers) {
      const newFirst = stripQuotes(golfer.firstName);
      const newLast = stripQuotes(golfer.lastName);

      if (newFirst !== golfer.firstName || newLast !== golfer.lastName) {
        await db
          .collection('golfers')
          .updateOne(
            { _id: golfer._id },
            { $set: { firstName: newFirst, lastName: newLast, updatedAt: new Date() } }
          );
        console.log(
          `   ✅ Golfer: "${golfer.firstName} ${golfer.lastName}" → "${newFirst} ${newLast}"`
        );
        golfersFixed++;
      }
    }

    // Fix tournament names
    const tournaments = await db.collection('tournaments').find({}).toArray();
    let tournamentsFixed = 0;

    for (const tournament of tournaments) {
      const newName = tournament.name.replace(/"/g, '').trim();

      if (newName !== tournament.name) {
        await db
          .collection('tournaments')
          .updateOne({ _id: tournament._id }, { $set: { name: newName, updatedAt: new Date() } });
        console.log(`   ✅ Tournament: "${tournament.name}" → "${newName}"`);
        tournamentsFixed++;
      }
    }

    console.log(`\n🎉 Done! Fixed ${golfersFixed} golfers and ${tournamentsFixed} tournaments.\n`);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  } finally {
    await client.close();
  }
}

cleanup().catch(console.error);
