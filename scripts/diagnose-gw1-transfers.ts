// Diagnostic script: Find ALL GW1 transfers that weren't applied for GW2
//
// Reads the production MongoDB and produces a detailed report of every pick
// that still has pending transfers from GW1, or where gameweekRosters["2"]
// doesn't match the expected post-transfer team.
//
// Distinguishes between:
//   - Picks with GW1 pending fields still set (need live team + roster fix)
//   - Picks where pending was cleared but gameweekRosters["2"] is wrong (roster-only fix)
//   - Picks that self-healed (user visited team page → applyPendingChanges ran)
//
// This is read-only — it makes NO changes to the database.
//
// Usage:
//   npx tsx scripts/diagnose-gw1-transfers.ts

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

interface PickDoc {
  _id: ObjectId;
  userId: ObjectId;
  golferIds: ObjectId[];
  captainId?: ObjectId | null;
  pendingGolferIds?: ObjectId[];
  pendingCaptainId?: ObjectId | null;
  pendingChangedAt?: Date;
  allGolferIds?: ObjectId[];
  gameweekRosters?: Record<string, { golferIds: ObjectId[]; captainId: ObjectId | null }>;
  totalSpent: number;
  season: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PickHistoryDoc {
  _id: ObjectId;
  userId: ObjectId;
  golferIds: ObjectId[];
  captainId?: ObjectId | null;
  totalSpent: number;
  season: number;
  changedAt: Date;
  reason: string;
}

interface SeasonDoc {
  _id: ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  firstGameweekStart?: Date;
  isActive: boolean;
}

function getSeasonFirstSaturday(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function idsToSet(ids: ObjectId[]): Set<string> {
  return new Set(ids.map((id) => id.toString()));
}

function sameIdSets(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of Array.from(a)) if (!b.has(id)) return false;
  return true;
}

async function diagnose() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set. Create a .env.local with MONGODB_URI.');
    process.exit(1);
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    // === Season config ===
    const season = await db.collection<SeasonDoc>('seasons').findOne({ isActive: true });
    if (!season) {
      console.error('❌ No active season found.');
      process.exit(1);
    }

    const seasonNum = parseInt(season.name, 10) || new Date().getFullYear();
    const firstGWConfig = season.firstGameweekStart
      ? new Date(season.firstGameweekStart)
      : null;
    const GW1_START = firstGWConfig || getSeasonFirstSaturday(new Date(season.startDate));
    const firstSat = getSeasonFirstSaturday(GW1_START);
    const GW2_START = new Date(firstSat);
    GW2_START.setDate(GW2_START.getDate() + 7);
    GW2_START.setHours(0, 0, 0, 0);

    // Transfer deadline is 8am Saturday — matches TEAM_ELIGIBILITY_HOUR in the app.
    // Transfers submitted before 8am on GW2's Saturday still count as GW1 transfers.
    const TEAM_ELIGIBILITY_HOUR = 8;
    const GW2_DEADLINE = new Date(GW2_START);
    GW2_DEADLINE.setHours(TEAM_ELIGIBILITY_HOUR, 0, 0, 0);

    console.log('\n🔍 GW1 Transfer Diagnosis (READ-ONLY)\n');
    console.log(`📅 Season: ${season.name}`);
    console.log(`📅 firstGameweekStart: ${firstGWConfig?.toISOString() || 'not set'}`);
    console.log(`📅 GW1: ${GW1_START.toISOString()} → ${GW2_DEADLINE.toISOString()} (8am deadline)`);
    console.log('');

    // === Fetch all golfer and user names ===
    const golferDocs = await db
      .collection('golfers')
      .find({})
      .project({ firstName: 1, lastName: 1 })
      .toArray();
    const golferNames = new Map(
      golferDocs.map((g) => [g._id.toString(), `${g.firstName} ${g.lastName}`])
    );

    const userDocs = await db
      .collection('users')
      .find({})
      .project({ firstName: 1, lastName: 1, username: 1 })
      .toArray();
    const userNames = new Map(
      userDocs.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName} (@${u.username})`])
    );

    // === 1. Find all scheduled transfers during GW1 from pickHistory ===
    const gw1Transfers = await db
      .collection<PickHistoryDoc>('pickHistory')
      .find({
        season: seasonNum,
        changedAt: { $gte: GW1_START, $lt: GW2_DEADLINE },
        reason: { $in: ['Scheduled transfer', 'Scheduled captain change'] },
      })
      .sort({ changedAt: 1 })
      .toArray();

    console.log(`📋 Found ${gw1Transfers.length} scheduled transfer(s) during GW1\n`);

    // === 2. Find picks with GW1-era pending fields still set ===
    const picksWithGW1Pending = await db
      .collection<PickDoc>('picks')
      .find({
        season: seasonNum,
        pendingChangedAt: { $gte: GW1_START, $lt: GW2_DEADLINE },
      })
      .toArray();

    console.log(`⏳ Found ${picksWithGW1Pending.length} pick(s) with GW1-era pendingChangedAt still set\n`);

    // === 3. Get all picks for cross-referencing ===
    const allPicks = await db
      .collection<PickDoc>('picks')
      .find({ season: seasonNum })
      .toArray();
    const picksByUser = new Map(allPicks.map((p) => [p.userId.toString(), p]));

    // === 4. Analyse each GW1 scheduled transfer ===
    console.log('━'.repeat(70));
    console.log('DETAILED ANALYSIS');
    console.log('━'.repeat(70));

    // Group transfers by user — take the LAST one as the expected GW2 state
    const lastTransferByUser = new Map<string, PickHistoryDoc>();
    for (const t of gw1Transfers) {
      lastTransferByUser.set(t.userId.toString(), t);
    }

    let needsLiveFix = 0;
    let needsRosterFix = 0;
    let selfHealed = 0;
    let alreadyOk = 0;
    const affectedUsers: Array<{ name: string; type: string }> = [];

    for (const [userId, lastTransfer] of Array.from(lastTransferByUser)) {
      const userName = userNames.get(userId) || userId;
      const pick = picksByUser.get(userId);

      if (!pick) {
        console.log(`\n❓ ${userName}: Has scheduled transfer but NO pick document!`);
        continue;
      }

      // Skip admin
      if (userName.includes('@admin')) {
        alreadyOk++;
        continue;
      }

      const expectedGolferIds = idsToSet(lastTransfer.golferIds);
      const expectedCaptainId = lastTransfer.captainId?.toString() || null;
      const currentGolferIds = idsToSet(pick.golferIds);

      // Find what was swapped (look at previous history entry)
      const allHistory = await db
        .collection<PickHistoryDoc>('pickHistory')
        .find({ userId: new ObjectId(userId), season: seasonNum })
        .sort({ changedAt: 1 })
        .toArray();

      let preTransferGolferIds: Set<string> | null = null;
      for (let i = 0; i < allHistory.length; i++) {
        if (allHistory[i]._id.toString() === lastTransfer._id.toString() && i > 0) {
          preTransferGolferIds = idsToSet(allHistory[i - 1].golferIds);
          break;
        }
      }

      const added = Array.from(expectedGolferIds).filter((id) => !preTransferGolferIds?.has(id));
      const removed = preTransferGolferIds
        ? Array.from(preTransferGolferIds).filter((id) => !expectedGolferIds.has(id))
        : [];
      const addedNames = added.map((id) => golferNames.get(id) || id).join(', ');
      const removedNames = removed.map((id) => golferNames.get(id) || id).join(', ');

      // === Check each field ===

      // Is pendingChangedAt still from GW1? (transfer still unapplied)
      const hasGW1Pending = pick.pendingChangedAt
        && new Date(pick.pendingChangedAt) >= GW1_START
        && new Date(pick.pendingChangedAt) < GW2_DEADLINE;

      // Does golferIds match the expected post-transfer team?
      const golferIdsCorrect = sameIdSets(currentGolferIds, expectedGolferIds);

      // Does gameweekRosters["2"] have the correct golfers + captain?
      const gw2Roster = pick.gameweekRosters?.['2'];
      let gw2GolfersOk = false;
      let gw2CaptainOk = false;
      let gw2RosterStatus: string;
      if (!gw2Roster) {
        gw2RosterStatus = '❌ Missing';
      } else {
        const gw2Ids = idsToSet(gw2Roster.golferIds);
        gw2GolfersOk = sameIdSets(gw2Ids, expectedGolferIds);
        gw2CaptainOk = (gw2Roster.captainId?.toString() || null) === expectedCaptainId;
        if (gw2GolfersOk && gw2CaptainOk) {
          gw2RosterStatus = '✅ Correct';
        } else if (gw2GolfersOk) {
          gw2RosterStatus = '⚠️  Golfers correct, captain wrong';
        } else {
          gw2RosterStatus = '❌ Wrong golfers';
        }
      }

      // Determine fix type
      let fixType: string;
      if (hasGW1Pending) {
        fixType = 'LIVE+ROSTER';
        needsLiveFix++;
      } else if (!gw2GolfersOk || !gw2CaptainOk) {
        fixType = 'ROSTER-ONLY';
        needsRosterFix++;
      } else if (golferIdsCorrect && gw2GolfersOk && gw2CaptainOk) {
        // Check if this was self-healed (golferIds match but no GW1 pending)
        fixType = 'OK';
        if (!hasGW1Pending && golferIdsCorrect) {
          selfHealed++;
        }
        alreadyOk++;
      } else {
        fixType = 'OK';
        alreadyOk++;
      }

      const icon = fixType === 'OK' ? '✅' : '🔴';
      console.log(`\n${icon} ${userName} [${fixType}]`);
      console.log(`   Transfer: ${removedNames || '?'} → ${addedNames || '?'} (${lastTransfer.reason})`);
      console.log(`   Date: ${new Date(lastTransfer.changedAt).toISOString()}`);
      console.log(`   golferIds:          ${golferIdsCorrect ? '✅ Correct' : '❌ Still shows OLD team'}`);
      console.log(`   gameweekRosters[2]: ${gw2RosterStatus}`);
      console.log(`   GW1 pending:        ${hasGW1Pending ? '❌ Still set' : '✅ Cleared / not from GW1'}`);

      if (fixType !== 'OK') {
        affectedUsers.push({ name: userName, type: fixType });

        if (!golferIdsCorrect && hasGW1Pending) {
          const currentNames = Array.from(currentGolferIds)
            .map((id) => golferNames.get(id) || id)
            .join(', ');
          const expectedNames = Array.from(expectedGolferIds)
            .map((id) => golferNames.get(id) || id)
            .join(', ');
          console.log(`   Current team:  [${currentNames}]`);
          console.log(`   Expected team: [${expectedNames}]`);
        }
      }
    }

    // === Summary ===
    console.log('\n' + '━'.repeat(70));
    console.log('SUMMARY');
    console.log('━'.repeat(70));
    console.log(`  Total GW1 scheduled transfers: ${gw1Transfers.length}`);
    console.log(`  Unique users with GW1 transfers: ${lastTransferByUser.size}`);
    console.log(`  Self-healed (user visited page): ${selfHealed}`);
    console.log(`  Already correct:                 ${alreadyOk}`);
    console.log(`  Need LIVE+ROSTER fix:            ${needsLiveFix}`);
    console.log(`  Need ROSTER-ONLY fix:            ${needsRosterFix}`);

    if (affectedUsers.length > 0) {
      console.log(`\n  Affected users:`);
      for (const { name, type } of affectedUsers) {
        console.log(`    • ${name} [${type}]`);
      }
    }

    const totalFixes = needsLiveFix + needsRosterFix;
    console.log(`\n${totalFixes > 0 ? '⚠️  Run apply-missed-gw1-transfers.ts to fix these.' : '✅ All transfers look correct!'}\n`);
  } finally {
    await client.close();
  }
}

diagnose().catch((err) => {
  console.error('❌ Diagnosis failed:', err);
  process.exit(1);
});
