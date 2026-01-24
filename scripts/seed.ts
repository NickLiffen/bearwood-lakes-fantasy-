// Database seed script
// Run with: npx ts-node --esm scripts/seed.ts

import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

async function seed() {
  console.log('🌱 Starting database seed...\n');

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    // ============================================
    // 1. Create indexes
    // ============================================
    console.log('📑 Creating indexes...');

    // Users indexes
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });

    // Players indexes
    await db.collection('players').createIndex({ isActive: 1 });

    // Picks indexes (one pick per user per season)
    await db.collection('picks').createIndex({ userId: 1, season: 1 }, { unique: true });

    // Pick History indexes
    await db.collection('pickHistory').createIndex({ userId: 1 });
    await db.collection('pickHistory').createIndex({ season: 1 });

    // Tournaments indexes
    await db.collection('tournaments').createIndex({ season: 1 });
    await db.collection('tournaments').createIndex({ status: 1 });

    // Scores indexes (one score per player per tournament)
    await db
      .collection('scores')
      .createIndex({ tournamentId: 1, playerId: 1 }, { unique: true });
    await db.collection('scores').createIndex({ tournamentId: 1 });
    await db.collection('scores').createIndex({ playerId: 1 });

    // Settings indexes
    await db.collection('settings').createIndex({ key: 1 }, { unique: true });

    console.log('✅ Indexes created\n');

    // ============================================
    // 2. Seed admin user
    // ============================================
    console.log('👤 Creating admin user...');

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

      console.log('✅ Admin user created');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   ⚠️  Change this password after first login!\n');
    } else {
      console.log('ℹ️  Admin user already exists\n');
    }

    // ============================================
    // 3. Seed initial settings
    // ============================================
    console.log('⚙️  Creating initial settings...');

    const settings = [
      { key: 'transfersOpen', value: false },
      { key: 'currentSeason', value: 2026 },
    ];

    for (const setting of settings) {
      const existing = await db.collection('settings').findOne({ key: setting.key });
      if (!existing) {
        await db.collection('settings').insertOne({
          key: setting.key,
          value: setting.value,
          updatedAt: new Date(),
        });
        console.log(`   ✅ ${setting.key}: ${setting.value}`);
      } else {
        console.log(`   ℹ️  ${setting.key} already exists: ${existing.value}`);
      }
    }

    console.log('');

    // ============================================
    // 4. Summary
    // ============================================
    console.log('📊 Database summary:');
    console.log(`   Users: ${await db.collection('users').countDocuments()}`);
    console.log(`   Players: ${await db.collection('players').countDocuments()}`);
    console.log(`   Tournaments: ${await db.collection('tournaments').countDocuments()}`);
    console.log(`   Picks: ${await db.collection('picks').countDocuments()}`);
    console.log(`   Scores: ${await db.collection('scores').countDocuments()}`);
    console.log(`   Settings: ${await db.collection('settings').countDocuments()}`);

    console.log('\n🎉 Seed complete!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await client.close();
  }
}

seed().catch(console.error);
