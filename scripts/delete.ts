// Database delete script - drops all collections
// Run with: npm run db:delete

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

async function confirmDeletion(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `\n⚠️  WARNING: This will DELETE ALL DATA from database "${MONGODB_DB_NAME}"!\n` +
        `   Type "DELETE" to confirm: `,
      (answer) => {
        rl.close();
        resolve(answer === 'DELETE');
      }
    );
  });
}

async function deleteDatabase() {
  console.log('🗑️  Database Delete Script\n');
  console.log(`   Database: ${MONGODB_DB_NAME}`);

  const confirmed = await confirmDeletion();

  if (!confirmed) {
    console.log('\n❌ Deletion cancelled.\n');
    process.exit(0);
  }

  console.log('\n🔄 Connecting to database...');

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    // Get all collections
    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log('ℹ️  No collections found in database.\n');
    } else {
      console.log(`\n🗑️  Dropping ${collections.length} collections...\n`);

      for (const collection of collections) {
        await db.collection(collection.name).drop();
        console.log(`   ✅ Dropped: ${collection.name}`);
      }
    }

    console.log('\n🎉 Database cleared successfully!');
    console.log('\n💡 Run "npm run db:seed" to recreate the schema and admin user.\n');
  } catch (error) {
    console.error('\n❌ Delete failed:', error);
    throw error;
  } finally {
    await client.close();
  }
}

deleteDatabase().catch(console.error);
