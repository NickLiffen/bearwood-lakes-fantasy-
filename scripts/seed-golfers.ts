// Database seed script for golfers
// Run with: npm run db:seed-golfers

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

// Realistic golf club member names - mix of British names
const firstNames = [
  'James',
  'William',
  'Oliver',
  'Thomas',
  'Harry',
  'George',
  'Charlie',
  'Jack',
  'Edward',
  'Henry',
  'Samuel',
  'Daniel',
  'David',
  'Michael',
  'Richard',
  'Robert',
  'Andrew',
  'Peter',
  'Christopher',
  'Matthew',
  'Stephen',
  'Paul',
  'Mark',
  'Simon',
  'Jonathan',
  'Nicholas',
  'Timothy',
  'Patrick',
  'Graham',
  'Colin',
  'Stuart',
  'Alan',
  'Brian',
  'Keith',
  'Derek',
  'Malcolm',
  'Trevor',
  'Nigel',
  'Clive',
  'Roger',
  'Emma',
  'Sophie',
  'Charlotte',
  'Victoria',
  'Elizabeth',
  'Sarah',
  'Catherine',
  'Rebecca',
  'Rachel',
  'Laura',
  'Jessica',
  'Hannah',
  'Claire',
  'Louise',
  'Helen',
  'Jennifer',
  'Amanda',
  'Susan',
  'Patricia',
  'Margaret',
  'Caroline',
  'Fiona',
  'Oscar',
  'Archie',
  'Leo',
  'Freddie',
  'Alfie',
  'Noah',
  'Theo',
  'Max',
  'Lucas',
  'Ethan',
  'Jacob',
  'Isaac',
  'Lily',
  'Grace',
  'Ella',
  'Mia',
  'Chloe',
  'Ava',
  'Geoffrey',
  'Bernard',
  'Harold',
  'Kenneth',
  'Ronald',
  'Norman',
  'Douglas',
  'Raymond',
  'Stanley',
  'Albert',
  'Arthur',
  'Ernest',
  'Frederick',
  'Walter',
  'Leonard',
  'Herbert',
  'Reginald',
  'Clifford',
  'Gerald',
  'Maurice',
];

const lastNames = [
  'Smith',
  'Jones',
  'Williams',
  'Brown',
  'Taylor',
  'Davies',
  'Wilson',
  'Evans',
  'Thomas',
  'Johnson',
  'Roberts',
  'Walker',
  'Wright',
  'Robinson',
  'Thompson',
  'White',
  'Hughes',
  'Edwards',
  'Green',
  'Hall',
  'Lewis',
  'Harris',
  'Clarke',
  'Patel',
  'Jackson',
  'Wood',
  'Turner',
  'Martin',
  'Cooper',
  'Hill',
  'Ward',
  'Morris',
  'Moore',
  'Clark',
  'Lee',
  'King',
  'Baker',
  'Harrison',
  'Morgan',
  'Allen',
  'James',
  'Scott',
  'Ellis',
  'Bennett',
  'Gray',
  'Collins',
  'Stewart',
  'Murphy',
  'Bell',
  'Kelly',
  'Cook',
  'Murray',
  'Shaw',
  'Webb',
  'Palmer',
  'Simpson',
  'Richardson',
  'Chapman',
  'Marshall',
  'Andrews',
  'Bailey',
  'Howard',
  'Price',
  'Watson',
  'Brooks',
  'Sanders',
  'Rose',
  'Powell',
  'Sullivan',
  'Russell',
  'Hamilton',
  'Reynolds',
  'Griffin',
  'Wallace',
  'Henderson',
  'Cole',
  'Perry',
  'Butler',
  'Patterson',
  'Barnes',
  'Fisher',
  'Grant',
  'Mason',
  'Spencer',
  'Fox',
];

// Avatar URLs using UI Avatars service
const getAvatarUrl = (firstName: string, lastName: string): string => {
  const colors = ['1a472a', '2563eb', 'd97706', 'db2777', '4b5563', '059669', '7c3aed'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(firstName)}+${encodeURIComponent(lastName)}&background=${color}&color=fff&size=200&bold=true`;
};

// Generate realistic stats based on skill tier
interface GolferStats {
  timesScored36Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

type SkillTier = 'elite' | 'strong' | 'average' | 'developing' | 'casual';

const generateStats = (tier: SkillTier, isCurrentSeason: boolean): GolferStats => {
  // Current season (2026) has fewer rounds as it's in progress
  const maxRounds = isCurrentSeason ? 8 : 25;

  let timesPlayed: number;
  let winRate: number;
  let podiumRate: number;
  let scoring36Rate: number;

  switch (tier) {
    case 'elite':
      timesPlayed = Math.floor(Math.random() * 8) + (isCurrentSeason ? 5 : 18);
      winRate = 0.15 + Math.random() * 0.1;
      podiumRate = 0.35 + Math.random() * 0.15;
      scoring36Rate = 0.4 + Math.random() * 0.2;
      break;
    case 'strong':
      timesPlayed = Math.floor(Math.random() * 8) + (isCurrentSeason ? 4 : 15);
      winRate = 0.08 + Math.random() * 0.07;
      podiumRate = 0.2 + Math.random() * 0.15;
      scoring36Rate = 0.25 + Math.random() * 0.15;
      break;
    case 'average':
      timesPlayed = Math.floor(Math.random() * 10) + (isCurrentSeason ? 3 : 12);
      winRate = 0.02 + Math.random() * 0.05;
      podiumRate = 0.08 + Math.random() * 0.1;
      scoring36Rate = 0.1 + Math.random() * 0.1;
      break;
    case 'developing':
      timesPlayed = Math.floor(Math.random() * 8) + (isCurrentSeason ? 2 : 8);
      winRate = Math.random() * 0.03;
      podiumRate = 0.02 + Math.random() * 0.06;
      scoring36Rate = 0.05 + Math.random() * 0.08;
      break;
    case 'casual':
    default:
      timesPlayed = Math.floor(Math.random() * 6) + (isCurrentSeason ? 1 : 5);
      winRate = Math.random() * 0.02;
      podiumRate = Math.random() * 0.04;
      scoring36Rate = Math.random() * 0.05;
      break;
  }

  timesPlayed = Math.min(timesPlayed, maxRounds);

  const timesFinished1st = Math.floor(timesPlayed * winRate);
  const remainingPodiums = Math.floor(timesPlayed * podiumRate) - timesFinished1st;
  const timesFinished2nd = Math.max(0, Math.floor(remainingPodiums * 0.5));
  const timesFinished3rd = Math.max(0, remainingPodiums - timesFinished2nd);
  const timesScored36Plus = Math.floor(timesPlayed * scoring36Rate);

  return {
    timesScored36Plus: Math.max(timesScored36Plus, timesFinished1st), // Winners usually score well
    timesFinished1st,
    timesFinished2nd,
    timesFinished3rd,
    timesPlayed,
  };
};

// Generate price based on tier (in pounds, stored as whole number)
const generatePrice = (tier: SkillTier): number => {
  let basePrice: number;

  switch (tier) {
    case 'elite':
      basePrice = 8_000_000 + Math.floor(Math.random() * 4_000_000); // £8M - £12M
      break;
    case 'strong':
      basePrice = 5_000_000 + Math.floor(Math.random() * 3_000_000); // £5M - £8M
      break;
    case 'average':
      basePrice = 2_500_000 + Math.floor(Math.random() * 2_500_000); // £2.5M - £5M
      break;
    case 'developing':
      basePrice = 1_000_000 + Math.floor(Math.random() * 1_500_000); // £1M - £2.5M
      break;
    case 'casual':
    default:
      basePrice = 500_000 + Math.floor(Math.random() * 500_000); // £500K - £1M
      break;
  }

  // Round to nearest 100K
  return Math.round(basePrice / 100_000) * 100_000;
};

// Determine skill tier with weighted distribution
const getSkillTier = (): SkillTier => {
  const rand = Math.random();
  if (rand < 0.05) return 'elite'; // 5% elite players
  if (rand < 0.2) return 'strong'; // 15% strong players
  if (rand < 0.55) return 'average'; // 35% average players
  if (rand < 0.8) return 'developing'; // 25% developing players
  return 'casual'; // 20% casual players
};

interface GolferDocument {
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  isActive: boolean;
  stats2025: GolferStats;
  stats2026: GolferStats;
  createdAt: Date;
  updatedAt: Date;
}

async function seedGolfers() {
  console.log('🏌️ Starting golfer seed...\n');

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    // Check existing golfer count
    const existingCount = await db.collection('golfers').countDocuments();
    console.log(`📊 Current golfer count: ${existingCount}\n`);

    // Track used name combinations to avoid duplicates
    const usedNames = new Set<string>();

    // Get existing names from database
    const existingGolfers = await db
      .collection('golfers')
      .find({}, { projection: { firstName: 1, lastName: 1 } })
      .toArray();
    existingGolfers.forEach((g) => usedNames.add(`${g.firstName}-${g.lastName}`));

    const golfers: GolferDocument[] = [];
    const now = new Date();

    // Generate 100 golfers
    let attempts = 0;
    const maxAttempts = 500;

    while (golfers.length < 100 && attempts < maxAttempts) {
      attempts++;

      const tier = getSkillTier();

      // Get random first name
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

      const nameKey = `${firstName}-${lastName}`;

      // Skip if name already used
      if (usedNames.has(nameKey)) {
        continue;
      }

      usedNames.add(nameKey);

      const golfer: GolferDocument = {
        firstName,
        lastName,
        picture: getAvatarUrl(firstName, lastName),
        price: generatePrice(tier),
        isActive: Math.random() > 0.05, // 95% active
        stats2025: generateStats(tier, false),
        stats2026: generateStats(tier, true),
        createdAt: now,
        updatedAt: now,
      };

      golfers.push(golfer);
    }

    if (golfers.length === 0) {
      console.log('⚠️  No new golfers to add (all name combinations already exist)');
    } else {
      // Insert golfers
      console.log(`🏌️ Inserting ${golfers.length} golfers...`);

      const result = await db.collection('golfers').insertMany(golfers);
      console.log(`✅ Inserted ${result.insertedCount} golfers\n`);

      // Price distribution
      const priceRanges = {
        'Elite (£8M+)': golfers.filter((g) => g.price >= 8_000_000).length,
        'Strong (£5M-£8M)': golfers.filter((g) => g.price >= 5_000_000 && g.price < 8_000_000)
          .length,
        'Average (£2.5M-£5M)': golfers.filter((g) => g.price >= 2_500_000 && g.price < 5_000_000)
          .length,
        'Developing (£1M-£2.5M)': golfers.filter((g) => g.price >= 1_000_000 && g.price < 2_500_000)
          .length,
        'Casual (<£1M)': golfers.filter((g) => g.price < 1_000_000).length,
      };

      console.log('💰 Price distribution:');
      Object.entries(priceRanges).forEach(([range, count]) => {
        console.log(`   ${range}: ${count}`);
      });
      console.log('');

      // Show some example golfers
      console.log('🎯 Sample golfers created:');
      const samples = golfers.slice(0, 5);
      samples.forEach((g) => {
        const priceStr = `£${(g.price / 1_000_000).toFixed(1)}M`;
        console.log(`   ${g.firstName} ${g.lastName} - ${priceStr}`);
        console.log(
          `      2025: ${g.stats2025.timesPlayed} played, ${g.stats2025.timesFinished1st} wins, ${g.stats2025.timesScored36Plus} x 36+`
        );
        console.log(
          `      2026: ${g.stats2026.timesPlayed} played, ${g.stats2026.timesFinished1st} wins, ${g.stats2026.timesScored36Plus} x 36+`
        );
      });
    }

    // Final count
    const finalCount = await db.collection('golfers').countDocuments();
    console.log(`\n📈 Total golfers in database: ${finalCount}`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await client.close();
    console.log('\n✅ Golfer seed complete!');
  }
}

seedGolfers().catch(console.error);
