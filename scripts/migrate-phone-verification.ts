// Migration script: Add phone verification fields to existing users
// Grandfathers all existing users as verified (phoneVerified: true, phoneNumber: null)
// Also creates a sparse unique index on phoneNumber.
//
// Usage:
//   npx tsx scripts/migrate-phone-verification.ts           # Dry run (preview)
//   npx tsx scripts/migrate-phone-verification.ts --apply    # Apply changes

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const isDryRun = !process.argv.includes('--apply');

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set. Please set it in your .env file.');
    process.exit(1);
  }

  console.log(`\n🔄 Phone Verification Migration ${isDryRun ? '(DRY RUN)' : '(APPLYING)'}\n`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCollection = db.collection('users');

    // Count users that need migration
    const usersWithoutPhone = await usersCollection.countDocuments({
      phoneVerified: { $exists: false },
    });

    const totalUsers = await usersCollection.countDocuments();

    console.log(`📊 Total users: ${totalUsers}`);
    console.log(`📊 Users needing migration: ${usersWithoutPhone}`);

    if (usersWithoutPhone === 0) {
      console.log('\n✅ All users already have phone verification fields. Nothing to do.');
    } else if (isDryRun) {
      console.log(`\n🔍 DRY RUN: Would update ${usersWithoutPhone} users:`);
      console.log('   - Set phoneNumber: null');
      console.log('   - Set phoneVerified: true (grandfathered)');
      console.log('\nRun with --apply to execute.');
    } else {
      console.log(`\n⚡ Updating ${usersWithoutPhone} users...`);

      const result = await usersCollection.updateMany(
        { phoneVerified: { $exists: false } },
        {
          $set: {
            phoneNumber: null,
            phoneVerified: true,
          },
        }
      );

      console.log(`✅ Updated ${result.modifiedCount} users.`);
    }

    // Create sparse unique index on phoneNumber
    console.log('\n📇 Checking phoneNumber index...');

    const existingIndexes = await usersCollection.indexes();
    const hasPhoneIndex = existingIndexes.some(
      (idx) => idx.name === 'phoneNumber_1' || (idx.key && 'phoneNumber' in idx.key)
    );

    if (hasPhoneIndex) {
      console.log('✅ phoneNumber index already exists.');
    } else if (isDryRun) {
      console.log('🔍 DRY RUN: Would create sparse unique index on phoneNumber.');
      console.log('   - Allows null (sparse), but enforces uniqueness for non-null values.');
    } else {
      await usersCollection.createIndex(
        { phoneNumber: 1 },
        {
          unique: true,
          partialFilterExpression: { phoneNumber: { $type: 'string' } },
          name: 'phoneNumber_1',
        }
      );
      console.log('✅ Created sparse unique index on phoneNumber.');
    }

    console.log('\n🏁 Migration complete!\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
