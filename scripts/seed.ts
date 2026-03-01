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

    // Golfers indexes
    await db.collection('golfers').createIndex({ isActive: 1 });

    // Picks indexes (one pick per user per season)
    await db.collection('picks').createIndex({ userId: 1, season: 1 }, { unique: true });

    // Pick History indexes
    await db.collection('pickHistory').createIndex({ season: 1 });

    // Tournaments indexes
    await db.collection('tournaments').createIndex({ status: 1 });

    // Scores indexes (one score per golfer per tournament)
    await db.collection('scores').createIndex({ tournamentId: 1, golferId: 1 }, { unique: true });
    await db.collection('scores').createIndex({ tournamentId: 1 });
    await db.collection('scores').createIndex({ golferId: 1 });

    // Settings indexes
    await db.collection('settings').createIndex({ key: 1 }, { unique: true });

    // Seasons indexes
    await db.collection('seasons').createIndex({ isActive: 1 });
    await db.collection('seasons').createIndex({ name: 1 }, { unique: true });

    // --- Optimized compound & coverage indexes ---

    // Tournaments - compound for season+status queries (leaderboard, picks, my-team)
    await db.collection('tournaments').createIndex({ season: 1, status: 1 });
    // Tournaments - sort index for getAllTournaments/getTournamentsBySeason
    await db.collection('tournaments').createIndex({ startDate: -1 });
    // Tournaments - idempotency check in season-upload
    await db.collection('tournaments').createIndex({ name: 1, season: 1 });

    // Picks - standalone season for leaderboard calculations
    await db.collection('picks').createIndex({ season: 1 });

    // PickHistory - compound for user history with sort (replaces standalone userId)
    // Covers getTransfersThisWeek() query filtering by userId, changedAt range, and reason
    await db.collection('pickHistory').createIndex({ userId: 1, changedAt: -1, reason: 1 });

    // RefreshTokens - token lookup during refresh flow
    await db.collection('refreshTokens').createIndex({ tokenHash: 1 });
    // RefreshTokens - revoke-all-for-user query
    await db.collection('refreshTokens').createIndex({ userId: 1, revokedAt: 1 });
    // RefreshTokens - TTL: auto-delete expired tokens
    await db.collection('refreshTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Golfers - name lookup for CSV upload (case-insensitive regex match)
    await db.collection('golfers').createIndex({ firstName: 1, lastName: 1 });

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

    const settings = [{ key: 'transfersOpen', value: false }];

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
    // 4. Create initial season
    // ============================================
    console.log('\n📅 Creating initial season...');

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
      console.log('✅ Season "2026" created (Apr 2026 – Mar 2027, Active)');
    } else {
      console.log('ℹ️  Season "2026" already exists, skipping');
    }

    // ============================================
    // 5. Summary
    // ============================================
    console.log('📊 Database summary:');
    console.log(`   Users: ${await db.collection('users').countDocuments()}`);
    console.log(`   Golfers: ${await db.collection('golfers').countDocuments()}`);
    console.log(`   Tournaments: ${await db.collection('tournaments').countDocuments()}`);
    console.log(`   Picks: ${await db.collection('picks').countDocuments()}`);
    console.log(`   Scores: ${await db.collection('scores').countDocuments()}`);
    console.log(`   Settings: ${await db.collection('settings').countDocuments()}`);
    console.log(`   Seasons: ${await db.collection('seasons').countDocuments()}`);

    console.log('\n🎉 Seed complete!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await client.close();
  }
}

seed().catch(console.error);
