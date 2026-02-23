// Update golfer prices based on composite performance score
// Run with: npm run db:update-prices

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

// Pricing constants
const MIN_PRICE = 1_000_000; // £1M floor
const MAX_ADDITIONAL = 11_000_000; // £11M range (total max = £12M)
const POWER_EXPONENT = 0.7; // Power curve for top-end separation
const MEAN_AVG_PTS = 3; // League average pts per event (for dampening)
const MIN_SAMPLE_SIZE = 5; // Min games before trusting raw average

async function updatePrices() {
  console.log('💰 Updating Golfer Prices');
  console.log(`   Database: ${MONGODB_DB_NAME}\n`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(MONGODB_DB_NAME);

    const golfers = await db.collection('golfers').find({}).toArray();
    const scores = await db
      .collection('scores')
      .find({ participated: true })
      .toArray();

    console.log(`📊 Analyzing ${golfers.length} golfers across ${scores.length} scores...\n`);

    // Calculate composite score for each golfer
    const golferData = golfers.map((g) => {
      const gScores = scores.filter(
        (s) => s.golferId.toString() === g._id.toString(),
      );

      const totalPoints = gScores.reduce(
        (sum, s) => sum + (s.multipliedPoints || 0),
        0,
      );
      const timesPlayed = gScores.length;
      const wins = gScores.filter((s) => s.position === 1).length;
      const podiums = gScores.filter(
        (s) => s.position !== null && s.position <= 3,
      ).length;
      const bonus32 = gScores.filter(
        (s) => (s.rawScore ?? 0) >= 32,
      ).length;
      const avgPtsPerEvent =
        timesPlayed > 0 ? totalPoints / timesPlayed : 0;
      const consistencyRate =
        timesPlayed >= 3 ? bonus32 / timesPlayed : 0;

      // Dampen average for small sample sizes
      const adjustedAvg =
        timesPlayed >= MIN_SAMPLE_SIZE
          ? avgPtsPerEvent
          : (avgPtsPerEvent * timesPlayed +
              MEAN_AVG_PTS * (MIN_SAMPLE_SIZE - timesPlayed)) /
            MIN_SAMPLE_SIZE;

      // Composite score
      const compositeScore =
        totalPoints * 1.0 +
        adjustedAvg * 5 +
        wins * 8 +
        podiums * 3 +
        consistencyRate * 20;

      return {
        id: g._id,
        name: `${g.firstName} ${g.lastName}`,
        compositeScore,
        totalPoints,
        timesPlayed,
        wins,
        podiums,
        bonus32,
        avgPtsPerEvent: Math.round(avgPtsPerEvent * 10) / 10,
      };
    });

    // Sort by composite score descending
    golferData.sort((a, b) => b.compositeScore - a.compositeScore);

    // Calculate prices using power curve
    const maxScore = golferData[0].compositeScore;

    let updated = 0;
    for (const g of golferData) {
      const normalizedScore =
        maxScore > 0 ? g.compositeScore / maxScore : 0;
      const priceFactor = Math.pow(Math.max(normalizedScore, 0), POWER_EXPONENT);
      const rawPrice = MIN_PRICE + priceFactor * MAX_ADDITIONAL;
      const price = Math.round(rawPrice / 100_000) * 100_000;

      await db
        .collection('golfers')
        .updateOne(
          { _id: g.id },
          { $set: { price, updatedAt: new Date() } },
        );
      updated++;
    }

    console.log(`✅ Updated ${updated} golfer prices\n`);

    // Show results
    console.log('💰 Top 15 by price:');
    const topPriced = golferData.slice(0, 15);
    for (const g of topPriced) {
      const normalizedScore = maxScore > 0 ? g.compositeScore / maxScore : 0;
      const priceFactor = Math.pow(Math.max(normalizedScore, 0), POWER_EXPONENT);
      const price = Math.round((MIN_PRICE + priceFactor * MAX_ADDITIONAL) / 100_000) * 100_000;
      console.log(
        `   £${(price / 1e6).toFixed(1)}M  ${g.name}  (pts:${g.totalPoints} played:${g.timesPlayed} wins:${g.wins} podiums:${g.podiums})`,
      );
    }

    // Tier distribution
    console.log('\n📊 Tier distribution:');
    const tiers: [string, (g: typeof golferData[0]) => boolean][] = [
      ['Elite (£10M+)', (g) => {
        const n = maxScore > 0 ? g.compositeScore / maxScore : 0;
        return Math.round((MIN_PRICE + Math.pow(Math.max(n, 0), POWER_EXPONENT) * MAX_ADDITIONAL) / 100_000) * 100_000 >= 10_000_000;
      }],
      ['Star (£7-10M)', (g) => {
        const n = maxScore > 0 ? g.compositeScore / maxScore : 0;
        const p = Math.round((MIN_PRICE + Math.pow(Math.max(n, 0), POWER_EXPONENT) * MAX_ADDITIONAL) / 100_000) * 100_000;
        return p >= 7_000_000 && p < 10_000_000;
      }],
      ['Strong (£5-7M)', (g) => {
        const n = maxScore > 0 ? g.compositeScore / maxScore : 0;
        const p = Math.round((MIN_PRICE + Math.pow(Math.max(n, 0), POWER_EXPONENT) * MAX_ADDITIONAL) / 100_000) * 100_000;
        return p >= 5_000_000 && p < 7_000_000;
      }],
      ['Average (£3-5M)', (g) => {
        const n = maxScore > 0 ? g.compositeScore / maxScore : 0;
        const p = Math.round((MIN_PRICE + Math.pow(Math.max(n, 0), POWER_EXPONENT) * MAX_ADDITIONAL) / 100_000) * 100_000;
        return p >= 3_000_000 && p < 5_000_000;
      }],
      ['Developing (£2-3M)', (g) => {
        const n = maxScore > 0 ? g.compositeScore / maxScore : 0;
        const p = Math.round((MIN_PRICE + Math.pow(Math.max(n, 0), POWER_EXPONENT) * MAX_ADDITIONAL) / 100_000) * 100_000;
        return p >= 2_000_000 && p < 3_000_000;
      }],
      ['Budget (£1-2M)', (g) => {
        const n = maxScore > 0 ? g.compositeScore / maxScore : 0;
        const p = Math.round((MIN_PRICE + Math.pow(Math.max(n, 0), POWER_EXPONENT) * MAX_ADDITIONAL) / 100_000) * 100_000;
        return p < 2_000_000;
      }],
    ];
    tiers.forEach(([label, fn]) =>
      console.log(`   ${label}: ${golferData.filter(fn).length} golfers`),
    );

    // Budget check
    const top6Cost = golferData.slice(0, 6).reduce((sum, g) => {
      const n = maxScore > 0 ? g.compositeScore / maxScore : 0;
      return sum + Math.round((MIN_PRICE + Math.pow(Math.max(n, 0), POWER_EXPONENT) * MAX_ADDITIONAL) / 100_000) * 100_000;
    }, 0);
    console.log(
      `\n🏆 Top 6 cost: £${(top6Cost / 1e6).toFixed(1)}M (budget: £50M) → ${top6Cost > 50e6 ? 'Forces trade-offs ✅' : 'Fits in budget'}`,
    );
  } finally {
    await client.close();
  }
}

updatePrices().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
