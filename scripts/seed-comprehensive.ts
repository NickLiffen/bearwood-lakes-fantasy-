// Comprehensive database seed script for tournaments, scores, users, and picks
// Run with: npm run db:seed-comprehensive

import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

// Constants
const TOTAL_BUDGET = 50_000_000; // $50M
const TEAM_SIZE = 6;
const TOTAL_TOURNAMENTS = 250;
const TOTAL_USERS = 100;
const USERS_WITH_TEAMS = 90;
const GOLFER_PARTICIPATION_RATE = 0.7; // 70% of golfers participate in each tournament
const DEFAULT_PASSWORD = 'password123';

// Tournament types and their multipliers
type TournamentType = 'rollup_stableford' | 'weekday_medal' | 'weekend_medal' | 'presidents_cup' | 'founders' | 'club_champs_nett';
type GolferCountTier = '0-10' | '10-20' | '20+';

const tournamentTypeMultipliers: Record<TournamentType, number> = {
  rollup_stableford: 1,
  weekday_medal: 1,
  weekend_medal: 2,
  presidents_cup: 3,
  founders: 4,
  club_champs_nett: 5,
};

// Tournament name templates
const tournamentNameTemplates = {
  monthly: ['{month} Medal', '{month} Stableford', '{month} Board Competition'],
  seasonal: ['Winter Stableford', 'Spring Classic', 'Summer Medal', 'Autumn Trophy'],
  special: [
    "Captain's Cup",
    "President's Trophy",
    'Club Championship',
    'Pro-Am Day',
    'Charity Classic',
    'Member-Guest',
    'Senior Championship',
    'Junior Championship',
    'Ladies Championship',
    'Mixed Foursomes',
    'Knockout Round 1',
    'Knockout Round 2',
    'Knockout Quarter-Final',
    'Knockout Semi-Final',
    'Knockout Final',
    'Board Competition #1',
    'Board Competition #2',
    'Board Competition #3',
    'Midweek Medal',
    'Weekend Stableford',
    'Saturday Medal',
    'Sunday Stableford',
    'Greensomes',
    'Texas Scramble',
    'Better Ball',
    'Singles Stableford',
    'Pairs Championship',
  ],
};

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// User name pools (reused from seed-golfers.ts pattern)
const userFirstNames = [
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
];

const userLastNames = [
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
];

// Helper functions
function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// New scoring model: flat position points for all field sizes
const POSITION_POINTS: Record<number, number> = { 1: 10, 2: 7, 3: 5 };

function getBasePointsForPosition(position: number | null): number {
  if (position === null) return 0;
  return POSITION_POINTS[position] ?? 0;
}

function getBonusPointsFromScore(scored36Plus: boolean): number {
  return scored36Plus ? 3 : 0;
}

function getTournamentType(): TournamentType {
  const rand = Math.random();
  if (rand < 0.5) return 'rollup_stableford'; // 50% rollup stableford
  if (rand < 0.7) return 'weekday_medal'; // 20% weekday medal
  if (rand < 0.85) return 'weekend_medal'; // 15% weekend medal
  if (rand < 0.95) return 'presidents_cup'; // 10% presidents cup
  if (rand < 0.98) return 'founders'; // 3% founders
  return 'club_champs_nett'; // 2% club champs nett
}

function getGolferCountTier(participantCount: number): GolferCountTier {
  if (participantCount <= 10) return '0-10';
  if (participantCount <= 20) return '10-20';
  return '20+';
}

function generateTournamentName(
  monthIndex: number,
  weekIndex: number,
  usedNames: Set<string>
): string {
  const month = months[monthIndex];
  let name: string;
  let attempts = 0;

  do {
    const rand = Math.random();
    if (rand < 0.3) {
      // Monthly template
      const template = getRandomItem(tournamentNameTemplates.monthly);
      name = template.replace('{month}', month);
    } else if (rand < 0.4 && monthIndex >= 0) {
      // Seasonal
      if (monthIndex < 3 || monthIndex === 11) {
        name = 'Winter Stableford';
      } else if (monthIndex < 6) {
        name = 'Spring Classic';
      } else if (monthIndex < 9) {
        name = 'Summer Medal';
      } else {
        name = 'Autumn Trophy';
      }
    } else {
      // Special
      name = getRandomItem(tournamentNameTemplates.special);
    }

    // Add week number if name already used
    if (usedNames.has(name)) {
      name = `${name} - Week ${weekIndex + 1}`;
    }

    attempts++;
    if (attempts > 20) {
      // Force unique name
      name = `${month} Competition ${weekIndex + 1} - ${Math.floor(Math.random() * 1000)}`;
    }
  } while (usedNames.has(name) && attempts < 30);

  usedNames.add(name);
  return name;
}

function generateWeekendDates(
  year: number,
  month: number,
  week: number
): { start: Date; end: Date } {
  // Get the first day of the month
  const firstDay = new Date(year, month, 1);
  // Find first Saturday
  const firstSaturday = new Date(firstDay);
  firstSaturday.setDate(firstDay.getDate() + ((6 - firstDay.getDay() + 7) % 7));

  // Add weeks
  const startDate = new Date(firstSaturday);
  startDate.setDate(firstSaturday.getDate() + week * 7);

  // Sunday is the end date
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 1);

  // Make sure we're still in the correct month
  if (startDate.getMonth() !== month) {
    // Use last weekend of previous calculation
    startDate.setDate(startDate.getDate() - 7);
    endDate.setDate(endDate.getDate() - 7);
  }

  return { start: startDate, end: endDate };
}

function getRandomTeamCreatedDate(): Date {
  // Random date between Jan 1, 2026 and Jan 30, 2026
  const startDate = new Date(2026, 0, 1); // Jan 1, 2026
  const endDate = new Date(2026, 0, 30); // Jan 30, 2026
  const randomTime =
    startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime());
  return new Date(randomTime);
}

async function confirmAction(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

interface GolferDoc {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  price: number;
  isActive: boolean;
  stats2026: {
    timesScored36Plus: number;
    timesFinished1st: number;
    timesFinished2nd: number;
    timesFinished3rd: number;
    timesPlayed: number;
  };
}

interface TournamentDoc {
  _id?: ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  tournamentType: TournamentType;
  scoringFormat: 'stableford' | 'medal';
  isMultiDay: boolean;
  multiplier: number;
  golferCountTier: GolferCountTier;
  season: number;
  status: 'draft' | 'published' | 'complete';
  participatingGolferIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

interface ScoreDoc {
  tournamentId: ObjectId;
  golferId: ObjectId;
  participated: boolean;
  position: number | null;
  scored36Plus: boolean;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

interface UserDoc {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'user';
  createdAt: Date;
  updatedAt: Date;
}

interface PickDoc {
  userId: ObjectId;
  golferIds: ObjectId[];
  totalSpent: number;
  season: number;
  createdAt: Date;
  updatedAt: Date;
}

async function seedComprehensive() {
  console.log('🏌️ Starting comprehensive database seed...\n');

  // Confirm before proceeding
  const confirmed = await confirmAction(
    '⚠️  This will DELETE all existing tournaments, scores, picks, and non-admin users. Continue?'
  );

  if (!confirmed) {
    console.log('❌ Seed cancelled.');
    process.exit(0);
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    // ============================================
    // 1. Check prerequisites
    // ============================================
    console.log('\n📋 Checking prerequisites...');

    const golferCount = await db.collection('golfers').countDocuments();
    if (golferCount === 0) {
      console.log('❌ No golfers found in database!');
      console.log('   Please run: npm run db:seed-golfers');
      process.exit(1);
    }
    console.log(`   ✅ Found ${golferCount} golfers`);

    // ============================================
    // 2. Clear existing data
    // ============================================
    console.log('\n🗑️  Clearing existing data...');

    const deletedTournaments = await db.collection('tournaments').deleteMany({});
    console.log(`   Deleted ${deletedTournaments.deletedCount} tournaments`);

    const deletedScores = await db.collection('scores').deleteMany({});
    console.log(`   Deleted ${deletedScores.deletedCount} scores`);

    const deletedPicks = await db.collection('picks').deleteMany({});
    console.log(`   Deleted ${deletedPicks.deletedCount} picks`);

    const deletedPickHistory = await db.collection('pickHistory').deleteMany({});
    console.log(`   Deleted ${deletedPickHistory.deletedCount} pick history records`);

    // Delete non-admin users only
    const deletedUsers = await db.collection('users').deleteMany({ role: { $ne: 'admin' } });
    console.log(`   Deleted ${deletedUsers.deletedCount} non-admin users`);

    // Reset golfer stats2026
    await db.collection('golfers').updateMany(
      {},
      {
        $set: {
          'stats2026.timesScored36Plus': 0,
          'stats2026.timesFinished1st': 0,
          'stats2026.timesFinished2nd': 0,
          'stats2026.timesFinished3rd': 0,
          'stats2026.timesPlayed': 0,
        },
      }
    );
    console.log('   Reset golfer stats2026');

    // ============================================
    // 3. Get all active golfers
    // ============================================
    const allGolfers = (await db
      .collection('golfers')
      .find({ isActive: true })
      .toArray()) as unknown as GolferDoc[];

    console.log(`\n📊 Active golfers available: ${allGolfers.length}`);

    // ============================================
    // 4. Generate tournaments
    // ============================================
    console.log('\n🏆 Generating tournaments...');

    const tournaments: TournamentDoc[] = [];
    const usedNames = new Set<string>();
    const now = new Date();

    // Distribute 250 tournaments across months (Jan-Dec 2026)
    // ~21 tournaments per month, multiple tournaments per week
    const tournamentsPerMonth = Math.ceil(TOTAL_TOURNAMENTS / 12);

    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const isJanuary = monthIndex === 0;
      let monthTournamentCount = 0;

      // Create tournaments until we hit the monthly target or total limit
      while (monthTournamentCount < tournamentsPerMonth && tournaments.length < TOTAL_TOURNAMENTS) {
        // Determine which week of the month (0-4)
        const week = monthTournamentCount % 5;
        const dates = generateWeekendDates(2026, monthIndex, week);
        const tournamentType = getTournamentType();

        // Select participating golfers (70% of active golfers)
        const participantCount = Math.floor(allGolfers.length * GOLFER_PARTICIPATION_RATE);
        const shuffledGolfers = shuffleArray(allGolfers);
        const participants = shuffledGolfers.slice(0, participantCount);
        const tier = getGolferCountTier(participantCount);

        const tournament: TournamentDoc = {
          name: generateTournamentName(monthIndex, monthTournamentCount, usedNames),
          startDate: dates.start,
          endDate: dates.end,
          tournamentType,
          scoringFormat: tournamentType === 'rollup_stableford' || tournamentType === 'presidents_cup' || tournamentType === 'founders' ? 'stableford' : 'medal',
          isMultiDay: tournamentType === 'founders' || tournamentType === 'club_champs_nett',
          multiplier: tournamentTypeMultipliers[tournamentType],
          golferCountTier: tier,
          season: 2026,
          status: isJanuary ? 'complete' : 'published',
          participatingGolferIds: participants.map((g) => g._id),
          createdAt: now,
          updatedAt: now,
        };

        tournaments.push(tournament);
        monthTournamentCount++;
      }
    }

    // Insert tournaments and get IDs
    const tournamentResult = await db.collection('tournaments').insertMany(tournaments);
    console.log(`   ✅ Created ${tournamentResult.insertedCount} tournaments`);

    // Update tournament documents with their IDs
    const insertedTournaments = (await db
      .collection('tournaments')
      .find({ season: 2026 })
      .toArray()) as unknown as (TournamentDoc & { _id: ObjectId })[];

    // ============================================
    // 5. Generate scores for January tournaments
    // ============================================
    console.log('\n📈 Generating scores for January tournaments...');

    const januaryTournaments = insertedTournaments.filter((t) => t.status === 'complete');
    const scores: ScoreDoc[] = [];

    // Track stats updates for golfers
    const golferStatsUpdates: Map<
      string,
      {
        timesPlayed: number;
        timesFinished1st: number;
        timesFinished2nd: number;
        timesFinished3rd: number;
        timesScored36Plus: number;
      }
    > = new Map();

    for (const tournament of januaryTournaments) {
      const participantIds = tournament.participatingGolferIds;
      const shuffledParticipants = shuffleArray([...participantIds]);

      // Assign positions
      const firstPlace = shuffledParticipants[0];
      const secondPlace = shuffledParticipants[1];
      const thirdPlace = shuffledParticipants[2];

      for (let i = 0; i < shuffledParticipants.length; i++) {
        const golferId = shuffledParticipants[i];
        let position: number | null = null;

        if (golferId.equals(firstPlace)) position = 1;
        else if (golferId.equals(secondPlace)) position = 2;
        else if (golferId.equals(thirdPlace)) position = 3;

        // ~25% chance of scoring 36+ (higher for podium finishers)
        const scored36Plus =
          position !== null
            ? Math.random() < 0.6 // 60% for podium
            : Math.random() < 0.25; // 25% for others

        const basePoints = getBasePointsForPosition(position);
        const bonusPoints = getBonusPointsFromScore(scored36Plus);
        const multipliedPoints = (basePoints + bonusPoints) * tournament.multiplier;

        const score: ScoreDoc = {
          tournamentId: tournament._id,
          golferId,
          participated: true,
          position,
          scored36Plus,
          basePoints,
          bonusPoints,
          multipliedPoints,
          createdAt: now,
          updatedAt: now,
        };

        scores.push(score);

        // Track stats updates
        const golferIdStr = golferId.toString();
        const existing = golferStatsUpdates.get(golferIdStr) || {
          timesPlayed: 0,
          timesFinished1st: 0,
          timesFinished2nd: 0,
          timesFinished3rd: 0,
          timesScored36Plus: 0,
        };

        existing.timesPlayed++;
        if (position === 1) existing.timesFinished1st++;
        if (position === 2) existing.timesFinished2nd++;
        if (position === 3) existing.timesFinished3rd++;
        if (scored36Plus) existing.timesScored36Plus++;

        golferStatsUpdates.set(golferIdStr, existing);
      }
    }

    // Insert scores
    if (scores.length > 0) {
      const scoreResult = await db.collection('scores').insertMany(scores);
      console.log(`   ✅ Created ${scoreResult.insertedCount} scores`);
    }

    // ============================================
    // 6. Update golfer stats
    // ============================================
    console.log('\n🔄 Updating golfer stats...');

    let statsUpdated = 0;
    for (const [golferIdStr, stats] of golferStatsUpdates) {
      await db.collection('golfers').updateOne(
        { _id: new ObjectId(golferIdStr) },
        {
          $set: {
            'stats2026.timesPlayed': stats.timesPlayed,
            'stats2026.timesFinished1st': stats.timesFinished1st,
            'stats2026.timesFinished2nd': stats.timesFinished2nd,
            'stats2026.timesFinished3rd': stats.timesFinished3rd,
            'stats2026.timesScored36Plus': stats.timesScored36Plus,
          },
        }
      );
      statsUpdated++;
    }
    console.log(`   ✅ Updated stats for ${statsUpdated} golfers`);

    // ============================================
    // 7. Generate users
    // ============================================
    console.log('\n👥 Generating users...');

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const users: UserDoc[] = [];
    const usedUsernames = new Set<string>();

    // Get existing usernames
    const existingUsers = await db
      .collection('users')
      .find({}, { projection: { username: 1 } })
      .toArray();
    existingUsers.forEach((u) => usedUsernames.add(u.username));

    let attempts = 0;
    while (users.length < TOTAL_USERS && attempts < 500) {
      attempts++;

      const firstName = getRandomItem(userFirstNames);
      const lastName = getRandomItem(userLastNames);
      const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`;

      let username = baseUsername;
      let suffix = 1;
      while (usedUsernames.has(username)) {
        username = `${baseUsername}${suffix}`;
        suffix++;
      }

      usedUsernames.add(username);

      const user: UserDoc = {
        firstName,
        lastName,
        username,
        email: `${username}@example.com`,
        passwordHash,
        role: 'user',
        createdAt: now,
        updatedAt: now,
      };

      users.push(user);
    }

    // Insert users
    const userResult = await db.collection('users').insertMany(users);
    console.log(`   ✅ Created ${userResult.insertedCount} users`);

    // Get inserted user IDs
    const insertedUsers = await db.collection('users').find({ role: 'user' }).toArray();

    // ============================================
    // 8. Generate picks (teams)
    // ============================================
    console.log('\n👔 Generating teams (picks)...');

    const usersWithTeams = insertedUsers.slice(0, USERS_WITH_TEAMS);
    const picks: PickDoc[] = [];

    // Sort golfers by price for budget-aware selection
    const golfersByPrice = [...allGolfers].sort((a, b) => a.price - b.price);

    for (const user of usersWithTeams) {
      // Select 6 golfers within budget
      const selectedGolfers: GolferDoc[] = [];
      let totalSpent = 0;
      let remainingBudget = TOTAL_BUDGET;

      // Strategy: mix of price tiers to stay under budget
      const shuffledGolfers = shuffleArray([...allGolfers]);

      for (const golfer of shuffledGolfers) {
        if (selectedGolfers.length >= TEAM_SIZE) break;

        // Check if we can afford this golfer
        const remainingSlots = TEAM_SIZE - selectedGolfers.length;
        const minPriceForRemaining = golfersByPrice[0].price * (remainingSlots - 1);

        if (golfer.price + minPriceForRemaining <= remainingBudget) {
          selectedGolfers.push(golfer);
          totalSpent += golfer.price;
          remainingBudget -= golfer.price;
        }
      }

      // Fallback: if we couldn't fill team, add cheapest golfers
      if (selectedGolfers.length < TEAM_SIZE) {
        for (const golfer of golfersByPrice) {
          if (selectedGolfers.length >= TEAM_SIZE) break;
          if (selectedGolfers.some((g) => g._id.equals(golfer._id))) continue;

          selectedGolfers.push(golfer);
          totalSpent += golfer.price;
        }
      }

      const pick: PickDoc = {
        userId: user._id,
        golferIds: selectedGolfers.map((g) => g._id),
        totalSpent,
        season: 2026,
        createdAt: getRandomTeamCreatedDate(), // Random date Jan 1-30, 2026 for testing
        updatedAt: now,
      };

      picks.push(pick);
    }

    // Insert picks
    const pickResult = await db.collection('picks').insertMany(picks);
    console.log(`   ✅ Created ${pickResult.insertedCount} teams`);

    // ============================================
    // 9. Summary
    // ============================================
    console.log('\n' + '='.repeat(50));
    console.log('📊 SEED SUMMARY');
    console.log('='.repeat(50));

    const finalCounts = {
      tournaments: await db.collection('tournaments').countDocuments(),
      januaryTournaments: await db.collection('tournaments').countDocuments({ status: 'complete' }),
      scores: await db.collection('scores').countDocuments(),
      users: await db.collection('users').countDocuments(),
      usersWithTeams: await db.collection('picks').countDocuments(),
      golfers: await db.collection('golfers').countDocuments(),
    };

    console.log(`\n   Tournaments: ${finalCounts.tournaments} total`);
    console.log(`      - January (complete): ${finalCounts.januaryTournaments}`);
    console.log(
      `      - Future (published): ${finalCounts.tournaments - finalCounts.januaryTournaments}`
    );
    console.log(`   Scores: ${finalCounts.scores}`);
    console.log(`   Users: ${finalCounts.users} (including admin)`);
    console.log(`   Teams: ${finalCounts.usersWithTeams}`);
    console.log(`   Golfers: ${finalCounts.golfers}`);

    // Show some leaderboard data
    console.log('\n📋 Sample leaderboard data:');

    // Calculate points for users with teams
    const leaderboardData = [];
    for (const pick of picks.slice(0, 5)) {
      const userScores = await db
        .collection('scores')
        .find({ golferId: { $in: pick.golferIds } })
        .toArray();

      const totalPoints = userScores.reduce((sum, s) => sum + (s.multipliedPoints || 0), 0);
      const user = insertedUsers.find((u) => u._id.equals(pick.userId));

      leaderboardData.push({
        username: user?.username || 'Unknown',
        totalPoints,
      });
    }

    leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);
    leaderboardData.forEach((entry, i) => {
      console.log(`   ${i + 1}. ${entry.username}: ${entry.totalPoints} points`);
    });

    console.log('\n' + '='.repeat(50));
    console.log(`\n🎉 Comprehensive seed complete!`);
    console.log(`\n💡 Default user password: ${DEFAULT_PASSWORD}`);
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    throw error;
  } finally {
    await client.close();
  }
}

seedComprehensive().catch(console.error);
