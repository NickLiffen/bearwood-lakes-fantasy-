// Update golfer prices using convex power curve based on current price ranking
// Run with: npm run db:update-prices
// Flags: --dry-run (preview only), --backup (export current prices to JSON)

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';
import {
  MIN_PRICE,
  MAX_PRICE,
  POWER_EXPONENT,
  calculatePrice,
} from '../shared/constants/pricing';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const doBackup = args.includes('--backup');

async function updatePrices() {
  console.log('💰 Updating Golfer Prices (v2 — Convex Power Curve)');
  console.log(`   Database: ${MONGODB_DB_NAME}`);
  console.log(`   Floor: £${(MIN_PRICE / 1e6).toFixed(1)}M | Ceiling: £${(MAX_PRICE / 1e6).toFixed(1)}M | Exponent: ${POWER_EXPONENT}`);
  if (isDryRun) console.log('   🔍 DRY RUN — no database writes');
  console.log();

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(MONGODB_DB_NAME);

    const golfers = await db.collection('golfers').find({}).toArray();
    console.log(`📊 Found ${golfers.length} golfers\n`);

    if (golfers.length === 0) {
      console.log('No golfers found. Exiting.');
      return;
    }

    // Backup current prices if requested
    if (doBackup) {
      const backup = golfers.map((g) => ({
        id: g._id.toString(),
        name: `${g.firstName} ${g.lastName}`,
        price: g.price,
      }));
      const backupPath = path.join(__dirname, `pricing-backup-${Date.now()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
      console.log(`📦 Backup saved to ${backupPath}\n`);
    }

    // Sort by current price descending (preserves manual ranking adjustments)
    const sorted = [...golfers].sort((a, b) => b.price - a.price);

    // Find current price range for normalization
    const currentMax = sorted[0].price;
    const currentMin = sorted[sorted.length - 1].price;
    const currentRange = currentMax - currentMin || 1;

    console.log(`📈 Current price range: £${(currentMin / 1e6).toFixed(1)}M – £${(currentMax / 1e6).toFixed(1)}M\n`);

    // Calculate new prices based on current price ranking
    interface PriceUpdate {
      id: unknown;
      name: string;
      oldPrice: number;
      newPrice: number;
      oldRank: number;
      newRank: number;
    }
    const updates: PriceUpdate[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      const normalized = (g.price - currentMin) / currentRange;
      const newPrice = calculatePrice(normalized);

      updates.push({
        id: g._id,
        name: `${g.firstName} ${g.lastName}`,
        oldPrice: g.price,
        newPrice,
        oldRank: i + 1,
        newRank: 0, // calculated after sorting
      });
    }

    // Verify ranking preservation
    const sortedByNew = [...updates].sort((a, b) => b.newPrice - a.newPrice);
    sortedByNew.forEach((u, i) => { u.newRank = i + 1; });

    let rankingPreserved = true;
    for (const u of updates) {
      if (u.oldRank !== u.newRank) {
        rankingPreserved = false;
        break;
      }
    }

    // Show top 15
    console.log('💰 Price changes (top 15):');
    for (const u of updates.slice(0, 15)) {
      const arrow = u.newPrice > u.oldPrice ? '↑' : u.newPrice < u.oldPrice ? '↓' : '=';
      console.log(
        `   #${u.oldRank.toString().padStart(2)}  £${(u.oldPrice / 1e6).toFixed(1).padStart(4)}M → £${(u.newPrice / 1e6).toFixed(1).padStart(4)}M  ${arrow}  ${u.name}`
      );
    }

    // Show bottom 5
    if (updates.length > 15) {
      console.log('   ...');
      for (const u of updates.slice(-5)) {
        const arrow = u.newPrice > u.oldPrice ? '↑' : u.newPrice < u.oldPrice ? '↓' : '=';
        console.log(
          `   #${u.oldRank.toString().padStart(2)}  £${(u.oldPrice / 1e6).toFixed(1).padStart(4)}M → £${(u.newPrice / 1e6).toFixed(1).padStart(4)}M  ${arrow}  ${u.name}`
        );
      }
    }

    // Ranking check
    console.log(`\n🏅 Ranking preserved: ${rankingPreserved ? '✅ Yes' : '❌ No (see warnings above)'}`);

    // Tier distribution
    console.log('\n📊 New tier distribution:');
    const tierDefs: [string, (p: number) => boolean][] = [
      ['Elite (£12M+)', (p) => p >= 12_000_000],
      ['Star (£9-12M)', (p) => p >= 9_000_000 && p < 12_000_000],
      ['Strong (£6-9M)', (p) => p >= 6_000_000 && p < 9_000_000],
      ['Average (£4.5-6M)', (p) => p >= 4_500_000 && p < 6_000_000],
      ['Developing (£3.5-4.5M)', (p) => p < 4_500_000],
    ];
    for (const [label, fn] of tierDefs) {
      console.log(`   ${label}: ${updates.filter((u) => fn(u.newPrice)).length} golfers`);
    }

    // Budget check — top 6 cost
    const top6Cost = updates.slice(0, 6).reduce((sum, u) => sum + u.newPrice, 0);
    console.log(
      `\n🏆 Top 6 cost: £${(top6Cost / 1e6).toFixed(1)}M (budget: £50M) → ${top6Cost > 50e6 ? 'Forces trade-offs ✅' : '⚠️ Fits in budget — consider tuning'}`
    );

    // Check existing teams for budget impact
    const picks = await db.collection('picks').find({}).toArray();
    if (picks.length > 0) {
      console.log(`\n👥 Checking ${picks.length} existing teams for budget impact...`);
      let overBudget = 0;
      for (const pick of picks) {
        const teamIds = (pick.golferIds as { toString(): string }[]).map((id) => id.toString());
        const teamNewCost = updates
          .filter((u) => teamIds.includes(u.id.toString()))
          .reduce((sum, u) => sum + u.newPrice, 0);
        if (teamNewCost > 50_000_000) {
          overBudget++;
          console.log(`   ⚠️  User ${pick.userId}: £${(teamNewCost / 1e6).toFixed(1)}M (over by £${((teamNewCost - 50_000_000) / 1e6).toFixed(1)}M)`);
        }
      }
      if (overBudget === 0) {
        console.log('   ✅ No teams exceed budget');
      } else {
        console.log(`   ⚠️  ${overBudget} team(s) would exceed budget (enforced at next transfer window)`);
      }
    }

    // Apply updates (unless dry run)
    if (!isDryRun) {
      let updated = 0;
      for (const u of updates) {
        await db
          .collection('golfers')
          .updateOne({ _id: u.id }, { $set: { price: u.newPrice, updatedAt: new Date() } });
        updated++;
      }
      console.log(`\n✅ Updated ${updated} golfer prices`);
    } else {
      console.log('\n🔍 Dry run complete — no changes written to database');
    }
  } finally {
    await client.close();
  }
}

updatePrices().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
