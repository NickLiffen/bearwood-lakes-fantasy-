// Migration script: Scoring System V2
// Uses example-data.csv to populate real rawScore values, then recalculates all points
//
// Usage:
//   npx tsx scripts/migrate-scoring-v2.ts           # Dry run (preview changes)
//   npx tsx scripts/migrate-scoring-v2.ts --apply    # Apply changes

import { MongoClient, ObjectId } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const isDryRun = !process.argv.includes('--apply');

// New scoring helpers
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

interface CsvRow {
  date: string; // DD/MM/YYYY
  position: number;
  player: string;
  stablefordPoints: number;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  // Skip header
  return lines.slice(1).map(line => {
    const [date, position, player, stablefordPoints] = line.split(',');
    return {
      date: date.trim(),
      position: parseInt(position.trim(), 10),
      player: player.trim(),
      stablefordPoints: parseInt(stablefordPoints.trim(), 10),
    };
  });
}

// Convert DD/MM/YYYY to a normalized date string for matching
function normalizeDateFromCsv(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// Normalize a Date object to YYYY-MM-DD
function normalizeDateFromDb(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  // Load CSV data
  const csvPath = path.join(__dirname, 'example-data.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌ example-data.csv not found at', csvPath);
    process.exit(1);
  }

  const csvRows = parseCsv(csvPath);
  console.log(`\n🔄 Scoring System V2 Migration (with CSV data)`);
  console.log(`   Mode: ${isDryRun ? '🔍 DRY RUN (no changes will be made)' : '⚡ APPLYING CHANGES'}`);
  console.log(`   CSV rows loaded: ${csvRows.length}`);
  console.log('');

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const tournamentsCol = db.collection('tournaments');
  const scoresCol = db.collection('scores');
  const golfersCol = db.collection('golfers');

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

  // Step 2: Build lookup maps
  console.log('\n📋 Step 2: Build lookup maps from CSV + DB');

  // Load all tournaments and golfers
  const allTournaments = await tournamentsCol.find({}).toArray();
  const allGolfers = await golfersCol.find({}).toArray();

  // Build golfer name → ID map (firstName + lastName → ObjectId)
  const golferNameToId = new Map<string, ObjectId>();
  for (const g of allGolfers) {
    const fullName = `${g.firstName} ${g.lastName}`.toLowerCase();
    golferNameToId.set(fullName, g._id as ObjectId);
  }

  // Build tournament date → ID map
  const tournamentDateToId = new Map<string, ObjectId>();
  const tournamentDateToMultiplier = new Map<string, number>();
  for (const t of allTournaments) {
    const dateKey = normalizeDateFromDb(new Date(t.startDate));
    tournamentDateToId.set(dateKey, t._id as ObjectId);
    tournamentDateToMultiplier.set(dateKey, t.multiplier || 1);
  }

  // Build CSV lookup: "tournamentId:golferId" → stablefordPoints
  const csvLookup = new Map<string, number>();
  let csvMatched = 0;
  let csvUnmatched = 0;

  for (const row of csvRows) {
    const dateKey = normalizeDateFromCsv(row.date);
    const tournamentId = tournamentDateToId.get(dateKey);
    const golferId = golferNameToId.get(row.player.toLowerCase());

    if (tournamentId && golferId) {
      const key = `${tournamentId.toString()}:${golferId.toString()}`;
      csvLookup.set(key, row.stablefordPoints);
      csvMatched++;
    } else {
      csvUnmatched++;
      if (csvUnmatched <= 5) {
        console.log(`   ⚠️ No match: date=${row.date} (${dateKey}), player="${row.player}" → tournament=${!!tournamentId}, golfer=${!!golferId}`);
      }
    }
  }

  console.log(`   CSV rows matched to DB: ${csvMatched}`);
  if (csvUnmatched > 0) {
    console.log(`   CSV rows unmatched:     ${csvUnmatched}`);
  }

  // Step 3: Migrate scored36Plus → rawScore using CSV data
  console.log('\n📋 Step 3: Migrate scores with real stableford data from CSV');

  const allScores = await scoresCol.find({}).toArray();
  let updatedFromCsv = 0;
  let updatedFallback = 0;
  let totalPointsBefore = 0;
  let totalPointsAfter = 0;
  let newBonusScorerCount = 0;

  // Track bonus tier distribution
  let tier36Plus = 0;
  let tier32to35 = 0;
  let tierBelow32 = 0;
  let tierNull = 0;

  for (const score of allScores) {
    const tournamentId = score.tournamentId.toString();
    const golferId = score.golferId.toString();
    const key = `${tournamentId}:${golferId}`;
    const multiplier = tournamentDateToMultiplier.get(
      normalizeDateFromDb(new Date(
        allTournaments.find(t => t._id.toString() === tournamentId)?.startDate || new Date()
      ))
    ) || 1;

    totalPointsBefore += score.multipliedPoints || 0;

    // Look up real stableford score from CSV
    let rawScore: number | null = null;
    if (csvLookup.has(key)) {
      rawScore = csvLookup.get(key)!;
      updatedFromCsv++;
    } else if (score.scored36Plus === true) {
      // Fallback: if no CSV match but scored36Plus was true, use 36
      rawScore = 36;
      updatedFallback++;
    } else {
      tierNull++;
      updatedFallback++;
    }

    // Track distribution
    if (rawScore !== null) {
      if (rawScore >= 36) tier36Plus++;
      else if (rawScore >= 32) tier32to35++;
      else tierBelow32++;
    }

    // Calculate new points
    let basePoints = 0;
    let bonusPoints = 0;
    let multipliedPoints = 0;

    if (score.participated) {
      basePoints = getBasePointsForPosition(score.position);
      bonusPoints = getBonusPoints(rawScore, 'stableford');
      multipliedPoints = (basePoints + bonusPoints) * multiplier;
    }

    if (bonusPoints > 0) newBonusScorerCount++;
    totalPointsAfter += multipliedPoints;

    if (!isDryRun) {
      const updateFields: Record<string, unknown> = {
        rawScore,
        basePoints,
        bonusPoints,
        multipliedPoints,
        updatedAt: new Date(),
      };
      // Remove old field
      await scoresCol.updateOne(
        { _id: score._id },
        { $set: updateFields, $unset: { scored36Plus: '' } }
      );
    }
  }

  console.log(`   Scores updated from CSV:      ${updatedFromCsv}`);
  console.log(`   Scores updated with fallback: ${updatedFallback}`);
  console.log('');
  console.log('   📊 Stableford score distribution:');
  console.log(`      36+ (3 bonus pts):  ${tier36Plus}`);
  console.log(`      32-35 (1 bonus pt): ${tier32to35}`);
  console.log(`      < 32 (0 bonus):     ${tierBelow32}`);
  console.log(`      null (unknown):     ${tierNull}`);
  console.log('');
  console.log(`   Total bonus scorers:   ${newBonusScorerCount}`);
  console.log(`   Total points before:   ${totalPointsBefore}`);
  console.log(`   Total points after:    ${totalPointsAfter}`);
  console.log(`   Change:                ${totalPointsAfter - totalPointsBefore > 0 ? '+' : ''}${totalPointsAfter - totalPointsBefore}`);

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
