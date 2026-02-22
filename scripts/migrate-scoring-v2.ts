// Migration script: Scoring System V2
// Adds scoringFormat to tournaments, migrates scored36Plus → rawScore, recalculates all points
//
// Usage:
//   npx tsx scripts/migrate-scoring-v2.ts           # Dry run (preview changes)
//   npx tsx scripts/migrate-scoring-v2.ts --apply    # Apply changes

import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const isDryRun = !process.argv.includes('--apply');

// New scoring helpers (duplicated here to avoid import issues with tsx)
function getBasePointsForPosition(position: number | null): number {
  if (position === null) return 0;
  const points: Record<number, number> = { 1: 10, 2: 7, 3: 5 };
  return points[position] ?? 0;
}

function getBonusPoints(rawScore: number | null, scoringFormat: 'stableford' | 'medal'): number {
  if (rawScore === null) return 0;
  if (scoringFormat === 'stableford') {
    if (rawScore >= 36) return 3;
    if (rawScore >= 32) return 1;
    return 0;
  }
  if (rawScore <= 72) return 3;
  if (rawScore <= 76) return 1;
  return 0;
}

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  console.log(`\n🔄 Scoring System V2 Migration`);
  console.log(`   Mode: ${isDryRun ? '🔍 DRY RUN (no changes will be made)' : '⚡ APPLYING CHANGES'}`);
  console.log('');

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const tournamentsCol = db.collection('tournaments');
  const scoresCol = db.collection('scores');

  // Step 1: Add scoringFormat to all tournaments
  console.log('📋 Step 1: Add scoringFormat to tournaments');
  const tournamentsWithoutFormat = await tournamentsCol.countDocuments({
    scoringFormat: { $exists: false },
  });
  console.log(`   Found ${tournamentsWithoutFormat} tournaments without scoringFormat`);

  if (!isDryRun && tournamentsWithoutFormat > 0) {
    await tournamentsCol.updateMany(
      { scoringFormat: { $exists: false } },
      { $set: { scoringFormat: 'stableford' } }
    );
    console.log(`   ✅ Set scoringFormat = 'stableford' on ${tournamentsWithoutFormat} tournaments`);
  }

  // Step 2: Migrate scored36Plus → rawScore
  console.log('\n📋 Step 2: Migrate scored36Plus → rawScore');
  const scoresWithOldField = await scoresCol.countDocuments({
    scored36Plus: { $exists: true },
  });
  const scored36TrueCount = await scoresCol.countDocuments({ scored36Plus: true });
  const scored36FalseCount = await scoresCol.countDocuments({ scored36Plus: false });
  console.log(`   Found ${scoresWithOldField} scores with scored36Plus field`);
  console.log(`   - scored36Plus: true  → rawScore: 36 (${scored36TrueCount} scores)`);
  console.log(`   - scored36Plus: false → rawScore: null (${scored36FalseCount} scores)`);

  if (!isDryRun) {
    // Set rawScore = 36 for scored36Plus: true
    if (scored36TrueCount > 0) {
      await scoresCol.updateMany(
        { scored36Plus: true },
        { $set: { rawScore: 36 }, $unset: { scored36Plus: '' } }
      );
      console.log(`   ✅ Migrated ${scored36TrueCount} scores with scored36Plus: true → rawScore: 36`);
    }

    // Set rawScore = null for scored36Plus: false
    if (scored36FalseCount > 0) {
      await scoresCol.updateMany(
        { scored36Plus: false },
        { $set: { rawScore: null }, $unset: { scored36Plus: '' } }
      );
      console.log(`   ✅ Migrated ${scored36FalseCount} scores with scored36Plus: false → rawScore: null`);
    }
  }

  // Step 3: Recalculate all points with new scoring formula
  console.log('\n📋 Step 3: Recalculate all points');

  const allTournaments = await tournamentsCol.find({}).toArray();
  let totalRecalculated = 0;
  let totalPointsBefore = 0;
  let totalPointsAfter = 0;

  for (const tournament of allTournaments) {
    const tournamentId = tournament._id as ObjectId;
    const scoringFormat = (tournament.scoringFormat || 'stableford') as 'stableford' | 'medal';
    const multiplier = tournament.multiplier || 1;

    const scores = await scoresCol
      .find({ tournamentId })
      .toArray();

    for (const score of scores) {
      const oldMultipliedPoints = score.multipliedPoints || 0;
      totalPointsBefore += oldMultipliedPoints;

      let basePoints = 0;
      let bonusPoints = 0;
      let multipliedPoints = 0;

      if (score.participated) {
        basePoints = getBasePointsForPosition(score.position);
        const rawScore = score.rawScore ?? (score.scored36Plus ? 36 : null);
        bonusPoints = getBonusPoints(rawScore, scoringFormat);
        multipliedPoints = (basePoints + bonusPoints) * multiplier;
      }

      totalPointsAfter += multipliedPoints;

      if (!isDryRun) {
        await scoresCol.updateOne(
          { _id: score._id },
          {
            $set: {
              basePoints,
              bonusPoints,
              multipliedPoints,
              updatedAt: new Date(),
            },
          }
        );
      }
      totalRecalculated++;
    }
  }

  console.log(`   Recalculated ${totalRecalculated} scores across ${allTournaments.length} tournaments`);
  console.log(`   Total points before: ${totalPointsBefore}`);
  console.log(`   Total points after:  ${totalPointsAfter}`);
  console.log(`   Change:              ${totalPointsAfter - totalPointsBefore > 0 ? '+' : ''}${totalPointsAfter - totalPointsBefore}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  if (isDryRun) {
    console.log('🔍 DRY RUN COMPLETE — no changes were made');
    console.log('   Run with --apply to execute the migration');
  } else {
    console.log('✅ MIGRATION COMPLETE');
  }
  console.log('='.repeat(60) + '\n');

  await client.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
