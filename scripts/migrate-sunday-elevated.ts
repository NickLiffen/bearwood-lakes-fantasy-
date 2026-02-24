// Migration: Set Sunday tournaments to Elevated (2x multiplier) and recalculate scores
//
// Usage:
//   npx tsx scripts/migrate-sunday-elevated.ts           # Dry run
//   npx tsx scripts/migrate-sunday-elevated.ts --apply    # Apply changes

import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'url';
import * as path from 'path';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const isDryRun = !process.argv.includes('--apply');

function getBasePointsForPosition(position: number | null): number {
  if (position === null) return 0;
  const points: Record<number, number> = { 1: 10, 2: 7, 3: 5 };
  return points[position] ?? 0;
}

function getBonusPoints(rawScore: number | null): number {
  if (rawScore === null) return 0;
  if (rawScore >= 36) return 3;
  if (rawScore >= 32) return 1;
  return 0;
}

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is required');
    process.exit(1);
  }

  console.log(`\n🔄 Sunday → Elevated Migration`);
  console.log(`   Mode: ${isDryRun ? '🔍 DRY RUN' : '⚡ APPLYING CHANGES'}\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const tournamentsCol = db.collection('tournaments');
  const scoresCol = db.collection('scores');

  const allTournaments = await tournamentsCol.find({}).sort({ startDate: 1 }).toArray();

  // Identify Sunday tournaments
  const sundayTournaments = allTournaments.filter(t => new Date(t.startDate).getUTCDay() === 0);
  const saturdayTournaments = allTournaments.filter(t => new Date(t.startDate).getUTCDay() === 6);
  const otherTournaments = allTournaments.filter(t => {
    const day = new Date(t.startDate).getUTCDay();
    return day !== 0 && day !== 6;
  });

  console.log(`📋 Tournament breakdown:`);
  console.log(`   Saturday (regular 1x): ${saturdayTournaments.length}`);
  console.log(`   Sunday (→ elevated 2x): ${sundayTournaments.length}`);
  console.log(`   Other (regular 1x):    ${otherTournaments.length}`);
  console.log(`   Total:                 ${allTournaments.length}`);

  console.log(`\n📋 Sunday tournaments to update:`);
  for (const t of sundayTournaments) {
    const d = new Date(t.startDate).toISOString().split('T')[0];
    console.log(`   ${d} | ${t.name} | current: ${t.tournamentType} ${t.multiplier}x`);
  }

  // Step 1: Update Sunday tournaments to elevated
  console.log(`\n📋 Step 1: Set Sunday tournaments to elevated (2x)`);
  const sundayIds = sundayTournaments.map(t => t._id);

  if (!isDryRun) {
    await tournamentsCol.updateMany(
      { _id: { $in: sundayIds } },
      { $set: { tournamentType: 'weekend_medal', multiplier: 2, updatedAt: new Date() } }
    );
    console.log(`   ✅ Updated ${sundayIds.length} tournaments`);
  } else {
    console.log(`   Would update ${sundayIds.length} tournaments`);
  }

  // Step 2: Recalculate scores for Sunday tournaments
  console.log(`\n📋 Step 2: Recalculate scores for Sunday tournaments`);
  let totalRecalculated = 0;
  let pointsBefore = 0;
  let pointsAfter = 0;

  for (const tournament of sundayTournaments) {
    const scores = await scoresCol.find({ tournamentId: tournament._id }).toArray();
    const newMultiplier = 2;

    for (const score of scores) {
      pointsBefore += score.multipliedPoints || 0;

      let basePoints = 0;
      let bonusPoints = 0;
      let multipliedPoints = 0;

      if (score.participated) {
        basePoints = getBasePointsForPosition(score.position);
        bonusPoints = getBonusPoints(score.rawScore);
        multipliedPoints = (basePoints + bonusPoints) * newMultiplier;
      }

      pointsAfter += multipliedPoints;

      if (!isDryRun) {
        await scoresCol.updateOne(
          { _id: score._id },
          { $set: { basePoints, bonusPoints, multipliedPoints, updatedAt: new Date() } }
        );
      }
      totalRecalculated++;
    }
  }

  console.log(`   Recalculated ${totalRecalculated} scores across ${sundayTournaments.length} tournaments`);
  console.log(`   Sunday points before (1x): ${pointsBefore}`);
  console.log(`   Sunday points after (2x):  ${pointsAfter}`);
  console.log(`   Change:                    +${pointsAfter - pointsBefore}`);

  console.log('\n' + '='.repeat(50));
  if (isDryRun) {
    console.log('🔍 DRY RUN COMPLETE — no changes made');
    console.log('   Run with --apply to execute');
  } else {
    console.log('✅ MIGRATION COMPLETE');
  }
  console.log('='.repeat(50) + '\n');

  await client.close();
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
