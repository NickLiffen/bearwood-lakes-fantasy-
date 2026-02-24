// Seed database from new-data.csv
// Run with: npm run db:seed-csv

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env.local' });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

// ── Types ────────────────────────────────────────────────────────────────────

interface CsvRow {
  date: string;
  position: number;
  player: string;
  rawScore: number;
  tournamentType: string;
  scoringFormat: string;
  isMultiDay: boolean;
}

interface GolferSeasonStats {
  timesScored36Plus: number;
  timesScored32Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

type GolferCountTier = '0-10' | '10-20' | '20+';

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultStats(): GolferSeasonStats {
  return {
    timesScored36Plus: 0,
    timesScored32Plus: 0,
    timesFinished1st: 0,
    timesFinished2nd: 0,
    timesFinished3rd: 0,
    timesPlayed: 0,
  };
}

function parseDate(dateStr: string): Date {
  if (dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function getGolferCountTier(count: number): GolferCountTier {
  if (count <= 10) return '0-10';
  if (count < 20) return '10-20';
  return '20+';
}

// New scoring model: flat position points for all field sizes
const POSITION_POINTS: Record<number, number> = { 1: 10, 2: 7, 3: 5 };

function getBasePointsForPosition(position: number): number {
  return POSITION_POINTS[position] ?? 0;
}

function getBonusPoints(rawScore: number, scoringFormat: string, isMultiDay: boolean): number {
  if (scoringFormat === 'stableford' || scoringFormat === 'Stableford') {
    if (isMultiDay) {
      if (rawScore >= 72) return 3;
      if (rawScore >= 64) return 1;
      return 0;
    }
    if (rawScore >= 36) return 3;
    if (rawScore >= 32) return 1;
    return 0;
  }
  // Medal (nett score)
  if (isMultiDay) {
    if (rawScore <= 0) return 3;
    if (rawScore <= 8) return 1;
    return 0;
  }
  if (rawScore <= 0) return 3;
  if (rawScore <= 4) return 1;
  return 0;
}

function getSeasonForDate(date: Date): number {
  // Season runs Apr 1 – Mar 31 of the following year
  // Jan-Mar = previous year's season, Apr-Dec = current year's season
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  return month < 3 ? year - 1 : year;
}

function getStatsKey(season: number): 'stats2024' | 'stats2025' | 'stats2026' {
  if (season === 2026) return 'stats2026';
  if (season === 2025) return 'stats2025';
  return 'stats2024';
}

function parseCsv(csvText: string): CsvRow[] {
  const lines = csvText.split('\n');
  const rows: CsvRow[] = [];

  // Auto-detect delimiter from header line
  const headerLine = lines[0] || '';
  const delimiter = headerLine.includes('\t') ? '\t' : ',';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(delimiter);
    if (parts.length < 7) continue;

    const rawScore = parseInt(parts[3].trim(), 10);
    const position = parseInt(parts[1].trim(), 10);

    if (isNaN(position) || isNaN(rawScore)) continue;

    rows.push({
      date: parts[0].trim(),
      position,
      player: parts[2].trim(),
      rawScore,
      tournamentType: parts[4].trim(),
      scoringFormat: parts[5].trim(),
      isMultiDay: parts[6].trim().toLowerCase() === 'yes',
    });
  }

  return rows;
}

function calculatePrice(stats2024: GolferSeasonStats, stats2025: GolferSeasonStats): number {
  const totalPlayed = stats2024.timesPlayed + stats2025.timesPlayed;
  const totalWins = stats2024.timesFinished1st + stats2025.timesFinished1st;
  const totalPodiums =
    totalWins +
    stats2024.timesFinished2nd +
    stats2025.timesFinished2nd +
    stats2024.timesFinished3rd +
    stats2025.timesFinished3rd;
  const total36Plus = stats2024.timesScored36Plus + stats2025.timesScored36Plus;

  // Base price from activity
  let price = 1_000_000; // £1M minimum
  price += totalPlayed * 200_000; // £200K per tournament played
  price += totalWins * 1_500_000; // £1.5M per win
  price += totalPodiums * 500_000; // £500K per podium
  price += total36Plus * 300_000; // £300K per 36+ round

  // Cap at £12M
  return Math.min(price, 12_000_000);
}

// ── Confirmation ─────────────────────────────────────────────────────────────

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toUpperCase() === 'YES');
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function seedFromCsv() {
  console.log('🏌️ Bearwood Lakes Fantasy — Seed from CSV');
  console.log(`   Database: ${MONGODB_DB_NAME}`);
  console.log('');

  // Read CSV
  const csvPath = path.join(__dirname, 'new-data.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌ scripts/new-data.csv not found');
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(csvText);
  console.log(`📄 Parsed ${rows.length} score rows from CSV`);

  // Count unique tournaments and players
  const uniqueDates = new Set(rows.map((r) => r.date));
  const uniquePlayers = new Set(rows.map((r) => r.player));
  console.log(`   ${uniqueDates.size} tournaments, ${uniquePlayers.size} unique players`);
  console.log('');

  const proceed = await confirm(
    '⚠️  This will DELETE existing golfers, tournaments, scores, seasons, picks, and pickHistory.\n' +
      '   Users and settings will be preserved.\n' +
      '   Type "YES" to continue: ',
  );

  if (!proceed) {
    console.log('❌ Cancelled');
    process.exit(0);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(MONGODB_DB_NAME);

    // ── Step 1: Clear data ─────────────────────────────────────────────────
    console.log('\n🗑️  Clearing existing data...');
    const collectionsToClear = ['golfers', 'tournaments', 'scores', 'seasons', 'picks', 'pickHistory'];
    for (const col of collectionsToClear) {
      const result = await db.collection(col).deleteMany({});
      console.log(`   ${col}: ${result.deletedCount} deleted`);
    }

    // ── Step 2: Create seasons ─────────────────────────────────────────────
    console.log('\n📅 Creating seasons...');
    const now = new Date();
    const seasons = [
      {
        name: '2024',
        startDate: new Date(2024, 3, 1), // Apr 1, 2024
        endDate: new Date(2025, 2, 31), // Mar 31, 2025
        isActive: false,
        status: 'complete' as const,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: '2025',
        startDate: new Date(2025, 3, 1), // Apr 1, 2025
        endDate: new Date(2026, 2, 31), // Mar 31, 2026
        isActive: false,
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: '2026',
        startDate: new Date(2026, 3, 1), // Apr 1, 2026
        endDate: new Date(2027, 2, 31), // Mar 31, 2027
        isActive: true,
        status: 'setup' as const,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.collection('seasons').insertMany(seasons);
    for (const s of seasons) {
      const label = s.isActive ? '(active)' : `(${s.status})`;
      console.log(
        `   ${s.name}: ${s.startDate.toLocaleDateString()} – ${s.endDate.toLocaleDateString()} ${label}`,
      );
    }

    // ── Step 3: Group rows by date ─────────────────────────────────────────
    const dateGroups = new Map<string, CsvRow[]>();
    for (const row of rows) {
      const existing = dateGroups.get(row.date) || [];
      existing.push(row);
      dateGroups.set(row.date, existing);
    }

    // ── Step 4: Create golfers ─────────────────────────────────────────────
    console.log('\n👤 Creating golfers...');
    const golferMap = new Map<string, ObjectId>(); // "FirstName LastName" → _id

    for (const playerName of uniquePlayers) {
      const trimmed = playerName.trim();
      const spaceIndex = trimmed.indexOf(' ');
      const firstName = spaceIndex === -1 ? trimmed : trimmed.substring(0, spaceIndex);
      const lastName = spaceIndex === -1 ? '' : trimmed.substring(spaceIndex + 1);

      const doc = {
        firstName,
        lastName,
        picture: '',
        price: 1_000_000, // Placeholder, recalculated later
        membershipType: 'men' as const,
        isActive: true,
        stats2024: defaultStats(),
        stats2025: defaultStats(),
        stats2026: defaultStats(),
        createdAt: now,
        updatedAt: now,
      };

      const result = await db.collection('golfers').insertOne(doc);
      golferMap.set(trimmed, result.insertedId);
    }
    console.log(`   ${golferMap.size} golfers created`);

    // ── Step 5: Create tournaments and scores ──────────────────────────────
    console.log('\n🏆 Creating tournaments and scores...');
    let tournamentsCreated = 0;
    let scoresEntered = 0;

    // Track stats per golfer per season
    const golferStats = new Map<string, { stats2024: GolferSeasonStats; stats2025: GolferSeasonStats }>();
    for (const [_name, id] of golferMap) {
      golferStats.set(id.toString(), { stats2024: defaultStats(), stats2025: defaultStats() });
    }

    const MULTIPLIERS: Record<string, number> = {
      rollup_stableford: 1, weekday_medal: 1, weekend_medal: 2,
      presidents_cup: 3, founders: 4, club_champs_nett: 5,
    };

    for (const [dateStr, group] of dateGroups) {
      const date = parseDate(dateStr);
      const seasonNumber = getSeasonForDate(date);
      const tier = getGolferCountTier(group.length);
      const firstRow = group[0];
      const tournamentType = firstRow.tournamentType.toLowerCase();
      const scoringFormat = firstRow.scoringFormat.toLowerCase();
      const isMultiDay = firstRow.isMultiDay;
      const multiplier = MULTIPLIERS[tournamentType] ?? 1;
      const tournamentName = `${dateStr} Tournament`;

      // Create tournament
      const participatingGolferIds: ObjectId[] = [];
      const tournamentDoc = {
        name: tournamentName,
        startDate: date,
        endDate: date,
        tournamentType,
        scoringFormat,
        isMultiDay,
        multiplier,
        golferCountTier: tier,
        season: seasonNumber,
        status: 'complete' as const,
        participatingGolferIds,
        createdAt: now,
        updatedAt: now,
      };

      const tournamentResult = await db.collection('tournaments').insertOne(tournamentDoc);
      const tournamentId = tournamentResult.insertedId;
      tournamentsCreated++;

      // Create scores for each player in this tournament
      for (const row of group) {
        const golferId = golferMap.get(row.player.trim());
        if (!golferId) continue;

        participatingGolferIds.push(golferId);

        const basePoints = getBasePointsForPosition(row.position);
        const bonusPoints = getBonusPoints(row.rawScore, scoringFormat, isMultiDay);
        const multipliedPoints = (basePoints + bonusPoints) * multiplier;

        await db.collection('scores').insertOne({
          golferId,
          tournamentId,
          participated: true,
          position: row.position,
          rawScore: row.rawScore,
          basePoints,
          bonusPoints,
          multipliedPoints,
          createdAt: now,
          updatedAt: now,
        });
        scoresEntered++;

        // Accumulate stats
        const statsKey = getStatsKey(seasonNumber);
        const key = statsKey === 'stats2024' ? 'stats2024' : 'stats2025';
        const gs = golferStats.get(golferId.toString());
        if (gs) {
          gs[key].timesPlayed++;
          const earned3Bonus = getBonusPoints(row.rawScore, scoringFormat, isMultiDay) >= 3;
          const earned1Bonus = getBonusPoints(row.rawScore, scoringFormat, isMultiDay) >= 1;
          if (earned3Bonus) gs[key].timesScored36Plus++;
          if (earned1Bonus) gs[key].timesScored32Plus++;
          if (row.position === 1) gs[key].timesFinished1st++;
          if (row.position === 2) gs[key].timesFinished2nd++;
          if (row.position === 3) gs[key].timesFinished3rd++;
        }
      }

      // Update tournament with participating golfer IDs
      await db
        .collection('tournaments')
        .updateOne({ _id: tournamentId }, { $set: { participatingGolferIds } });
    }

    console.log(`   ${tournamentsCreated} tournaments created`);
    console.log(`   ${scoresEntered} scores entered`);

    // ── Step 6: Update golfer stats and prices ─────────────────────────────
    console.log('\n📊 Updating golfer stats and prices...');
    for (const [_name, golferId] of golferMap) {
      const gs = golferStats.get(golferId.toString());
      if (!gs) continue;

      const price = calculatePrice(gs.stats2024, gs.stats2025);

      await db.collection('golfers').updateOne(
        { _id: golferId },
        {
          $set: {
            stats2024: gs.stats2024,
            stats2025: gs.stats2025,
            price,
            updatedAt: new Date(),
          },
        },
      );
    }
    console.log(`   ${golferMap.size} golfers updated with stats and prices`);

    // ── Step 7: Ensure indexes ─────────────────────────────────────────────
    console.log('\n🔑 Ensuring indexes...');
    await db
      .collection('scores')
      .createIndex({ tournamentId: 1, golferId: 1 }, { unique: true });
    await db
      .collection('tournaments')
      .createIndex({ season: 1, status: 1 });
    await db.collection('golfers').createIndex({ isActive: 1 });
    await db
      .collection('seasons')
      .createIndex({ name: 1 }, { unique: true });
    console.log('   Indexes created');

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('\n✅ Seed complete!');
    console.log(`   Seasons: 3 (2024, 2025, 2026)`);
    console.log(`   Golfers: ${golferMap.size}`);
    console.log(`   Tournaments: ${tournamentsCreated}`);
    console.log(`   Scores: ${scoresEntered}`);

    // Show top golfers by price
    const topGolfers = await db
      .collection('golfers')
      .find()
      .sort({ price: -1 })
      .limit(10)
      .toArray();
    console.log('\n💰 Top 10 golfers by price:');
    for (const g of topGolfers) {
      console.log(`   £${(g.price / 1_000_000).toFixed(1)}M  ${g.firstName} ${g.lastName}`);
    }
  } finally {
    await client.close();
  }
}

seedFromCsv().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
