// Validate fantasy CSV export against real database
// Run with: npx tsx scripts/validate-csv-export.ts
//
// Connects to the production database, generates the CSV, and spot-checks
// random golfers by re-querying scores + picks directly.
// Reports PASS/FAIL per check with detailed diffs on failure.

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { MongoClient, ObjectId } from 'mongodb';
import { generateFantasyCsv } from '../netlify/functions/_shared/services/fantasy-csv.service';
import { getWeekStart, getGameweekNumber } from '../netlify/functions/_shared/utils/dates';

const SCORES_COLLECTION = 'scores';
const PICKS_COLLECTION = 'picks';
const TOURNAMENTS_COLLECTION = 'tournaments';
const SEASONS_COLLECTION = 'seasons';

interface CheckResult {
  name: string;
  passed: boolean;
  details?: string;
}

async function main() {
  console.log('🔍 Fantasy CSV Export Validator\n');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI not set. Add it to .env.local');
    process.exit(1);
  }

  // 1. Generate CSV via the service
  console.log('📊 Generating CSV via service...');
  const { rows, maxGameweek, csv } = await generateFantasyCsv();
  console.log(`   → ${rows.length} golfers, ${maxGameweek} gameweeks\n`);

  if (rows.length === 0) {
    console.log('⚠️  No golfers found. Is the season active?');
    process.exit(0);
  }

  // 2. Connect directly to DB for validation queries
  const client = await MongoClient.connect(mongoUri);
  const dbName = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';
  const db = client.db(dbName);

  // Load season for context
  const season = await db.collection(SEASONS_COLLECTION).findOne({ isActive: true });
  if (!season) {
    console.error('❌ No active season found');
    await client.close();
    process.exit(1);
  }

  const seasonNumber = parseInt(season.name, 10);
  const seasonStartDate = new Date(season.startDate);
  const firstGW = season.firstGameweekStart ? new Date(season.firstGameweekStart) : null;

  // Load tournaments for GW mapping
  const tournaments = await db
    .collection(TOURNAMENTS_COLLECTION)
    .find({ season: seasonNumber, status: { $in: ['published', 'complete'] } })
    .toArray();

  const tournamentGwMap = new Map<string, number>();
  for (const t of tournaments) {
    const weekStart = getWeekStart(new Date(t.startDate), firstGW);
    const gwNum = getGameweekNumber(weekStart, seasonStartDate, firstGW);
    tournamentGwMap.set(t._id.toString(), gwNum);
  }

  // 3. Pick 5 random golfers (or all if fewer than 5)
  const sampleSize = Math.min(5, rows.length);
  const shuffled = [...rows].sort(() => Math.random() - 0.5);
  const samples = shuffled.slice(0, sampleSize);

  const checks: CheckResult[] = [];

  // Load picks once for ownership checks
  const picks = await db.collection(PICKS_COLLECTION).find({ season: seasonNumber }).toArray();
  const totalPicks = picks.length;

  for (const golferRow of samples) {
    console.log(`🏌️  Checking: ${golferRow.name}`);

    // Find golfer in DB to get ObjectId
    const golferDoc = await db.collection('golfers').findOne({
      $expr: {
        $eq: [{ $concat: ['$firstName', ' ', '$lastName'] }, golferRow.name],
      },
    });

    if (!golferDoc) {
      checks.push({
        name: `${golferRow.name}: found in DB`,
        passed: false,
        details: 'Golfer not found by name concatenation',
      });
      continue;
    }

    // ── Check 1: Total points via direct score query ──
    const scores = await db
      .collection(SCORES_COLLECTION)
      .find({
        golferId: golferDoc._id,
        tournamentId: { $in: tournaments.map((t) => t._id) },
      })
      .toArray();

    let directTotal = 0;
    const directGwPoints = new Map<number, number>();

    for (const score of scores) {
      const gwNum = tournamentGwMap.get(score.tournamentId.toString());
      if (gwNum === undefined) continue;
      const pts = score.multipliedPoints || 0;
      directTotal += pts;
      directGwPoints.set(gwNum, (directGwPoints.get(gwNum) || 0) + pts);
    }

    checks.push({
      name: `${golferRow.name}: Total points`,
      passed: golferRow.totalPoints === directTotal,
      details:
        golferRow.totalPoints !== directTotal
          ? `CSV=${golferRow.totalPoints}, DB=${directTotal}`
          : undefined,
    });

    // ── Check 2: Per-GW points ──
    for (let gw = 1; gw <= maxGameweek; gw++) {
      const csvPts = golferRow.gameweekPoints.get(gw) || 0;
      const dbPts = directGwPoints.get(gw) || 0;
      checks.push({
        name: `${golferRow.name}: GW${gw} points`,
        passed: csvPts === dbPts,
        details: csvPts !== dbPts ? `CSV=${csvPts}, DB=${dbPts}` : undefined,
      });
    }

    // ── Check 3: Current ownership ──
    const currentCount = picks.filter((p: any) =>
      (p.golferIds as ObjectId[]).some((id) => id.toString() === golferDoc._id.toString())
    ).length;

    const expectedCurrentOwn =
      totalPicks > 0 ? Math.round((currentCount / totalPicks) * 1000) / 10 : 0;

    checks.push({
      name: `${golferRow.name}: Current ownership`,
      passed: golferRow.currentOwnership === expectedCurrentOwn,
      details:
        golferRow.currentOwnership !== expectedCurrentOwn
          ? `CSV=${golferRow.currentOwnership}%, expected=${expectedCurrentOwn}%`
          : undefined,
    });

    // ── Check 4: Total = sum of GW points ──
    let gwSum = 0;
    for (const pts of golferRow.gameweekPoints.values()) gwSum += pts;
    checks.push({
      name: `${golferRow.name}: Total = Σ(GW points)`,
      passed: golferRow.totalPoints === gwSum,
      details:
        golferRow.totalPoints !== gwSum
          ? `total=${golferRow.totalPoints}, sum=${gwSum}`
          : undefined,
    });
    // ── Check 5: Cumulative plays at maxGameweek ──
    // Mirror the Score model semantics (toScore: `doc.participated ?? true`):
    // legacy docs without `participated` are treated as a play.
    const participatedScores = scores.filter((s: any) => s.participated !== false);
    let cumulativeViaDb = 0;
    const directGwPlays = new Map<number, number>();
    for (const score of participatedScores) {
      const gwNum = tournamentGwMap.get(score.tournamentId.toString());
      if (gwNum === undefined) continue;
      directGwPlays.set(gwNum, (directGwPlays.get(gwNum) || 0) + 1);
    }
    for (let gw = 1; gw <= maxGameweek; gw++) {
      cumulativeViaDb += directGwPlays.get(gw) || 0;
      const csvCum = golferRow.gameweekCumulativePlays.get(gw) || 0;
      checks.push({
        name: `${golferRow.name}: GW${gw} cumulative plays`,
        passed: csvCum === cumulativeViaDb,
        details: csvCum !== cumulativeViaDb ? `CSV=${csvCum}, DB=${cumulativeViaDb}` : undefined,
      });
    }

    // ── Check 6: Cumulative series is non-decreasing ──
    let lastCum = 0;
    let monotonic = true;
    for (let gw = 1; gw <= maxGameweek; gw++) {
      const cum = golferRow.gameweekCumulativePlays.get(gw) || 0;
      if (cum < lastCum) {
        monotonic = false;
        break;
      }
      lastCum = cum;
    }
    checks.push({
      name: `${golferRow.name}: Cumulative plays monotonic non-decreasing`,
      passed: monotonic,
    });
  }

  // 4. CSV format checks
  const lines = csv.split('\r\n');
  const headerCols = lines[0].split(',').length;
  const expectedCols = 2 + maxGameweek * 3 + 2;

  checks.push({
    name: 'CSV header column count',
    passed: headerCols === expectedCols,
    details:
      headerCols !== expectedCols ? `got=${headerCols}, expected=${expectedCols}` : undefined,
  });

  checks.push({
    name: 'CSV row count matches golfer count',
    passed: lines.length - 1 === rows.length,
    details:
      lines.length - 1 !== rows.length
        ? `rows=${lines.length - 1}, golfers=${rows.length}`
        : undefined,
  });

  // 5. Report
  console.log('\n' + '═'.repeat(60));
  console.log('📋 VALIDATION RESULTS\n');

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    const icon = check.passed ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
    if (!check.passed && check.details) {
      console.log(`   → ${check.details}`);
    }
    if (check.passed) passed++;
    else failed++;
  }

  console.log(`\n${passed}/${passed + failed} checks passed`);

  if (failed > 0) {
    console.log('\n❌ VALIDATION FAILED — CSV data has discrepancies');
    await client.close();
    process.exit(1);
  } else {
    console.log('\n✅ ALL CHECKS PASSED — CSV data is valid');
  }

  await client.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
