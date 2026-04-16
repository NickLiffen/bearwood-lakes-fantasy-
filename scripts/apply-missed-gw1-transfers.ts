// Fix script: Apply all missed GW1 transfers for GW2
//
// The scheduled-apply-transfers function didn't exist until April 13 (PR #50),
// but GW2 started on April 11. This script retroactively applies all GW1
// transfers that were never applied.
//
// Safety: scopes ALL operations to the GW1 window only.
//   - Only touches pendingChangedAt values within GW1 (won't clear GW2+ pending transfers)
//   - Only updates golferIds when the GW1 pending change is provably still unapplied
//   - For self-healed picks (user visited team page), only fixes gameweekRosters["2"]
//   - Uses transfer.captainId from pickHistory as source of truth (not pending fields)
//
// Dry run by default — shows what would change without writing.
// Use --apply to write changes to the database.
//
// Usage:
//   npx tsx scripts/apply-missed-gw1-transfers.ts           # Dry run
//   npx tsx scripts/apply-missed-gw1-transfers.ts --apply    # Apply changes

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';
const isDryRun = !process.argv.includes('--apply');

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

function sameIds(a: ObjectId[], b: ObjectId[]): boolean {
  const setA = idsToSet(a);
  const setB = idsToSet(b);
  if (setA.size !== setB.size) return false;
  for (const id of Array.from(setA)) if (!setB.has(id)) return false;
  return true;
}

async function fix() {
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
    const firstGWConfig = season.firstGameweekStart ? new Date(season.firstGameweekStart) : null;
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

    console.log(
      `\n🔧 Apply Missed GW1 Transfers ${isDryRun ? '(DRY RUN)' : '(APPLYING CHANGES)'}\n`
    );
    console.log(`📅 Season: ${season.name}`);
    console.log(
      `📅 GW1: ${GW1_START.toISOString()} → ${GW2_DEADLINE.toISOString()} (8am deadline)`
    );
    console.log('');

    // === Fetch golfer names and prices ===
    const golferDocs = await db.collection('golfers').find({}).toArray();
    const golferNames = new Map(
      golferDocs.map((g) => [g._id.toString(), `${g.firstName} ${g.lastName}`])
    );
    const golferPrices = new Map(
      golferDocs.map((g) => [g._id.toString(), (g.price as number) || 0])
    );

    // === Fetch user names ===
    const userDocs = await db
      .collection('users')
      .find({})
      .project({ firstName: 1, lastName: 1, username: 1 })
      .toArray();
    const userNames = new Map(
      userDocs.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName} (@${u.username})`])
    );

    // === Find all scheduled transfers during GW1 from pickHistory ===
    const gw1Transfers = await db
      .collection<PickHistoryDoc>('pickHistory')
      .find({
        season: seasonNum,
        changedAt: { $gte: GW1_START, $lt: GW2_DEADLINE },
        reason: { $in: ['Scheduled transfer', 'Scheduled captain change'] },
      })
      .sort({ changedAt: 1 })
      .toArray();

    // Group by user — take the LAST scheduled change as the expected GW2 state
    const lastTransferByUser = new Map<string, PickHistoryDoc>();
    for (const t of gw1Transfers) {
      lastTransferByUser.set(t.userId.toString(), t);
    }

    console.log(`📋 Found ${lastTransferByUser.size} user(s) with GW1 transfers to process\n`);
    console.log('━'.repeat(70));

    let fixedLive = 0;
    let fixedRoster = 0;
    let alreadyOk = 0;
    let errors = 0;

    for (const [userId, transfer] of Array.from(lastTransferByUser)) {
      const userName = userNames.get(userId) || userId;

      // Get the current pick
      const pick = await db.collection<PickDoc>('picks').findOne({
        userId: new ObjectId(userId),
        season: seasonNum,
      });

      if (!pick) {
        console.log(`\n❓ ${userName}: No pick found — skipping`);
        errors++;
        continue;
      }

      // Skip admin
      if (userName.includes('@admin')) {
        alreadyOk++;
        continue;
      }

      // === Source of truth: the pickHistory entry ===
      const expectedGolferIds = transfer.golferIds;
      const expectedCaptainId = transfer.captainId || null;

      // === Determine if the GW1 pending change is still unapplied ===
      // Only touch live fields (golferIds/captainId/pending*) when pendingChangedAt
      // is within the GW1 window — this means the transfer was never applied.
      const hasGW1Pending =
        pick.pendingChangedAt &&
        new Date(pick.pendingChangedAt) >= GW1_START &&
        new Date(pick.pendingChangedAt) < GW2_DEADLINE;

      // === Check if gameweekRosters["2"] is correct ===
      const gw2Roster = pick.gameweekRosters?.['2'];
      const gw2GolfersOk = gw2Roster && sameIds(gw2Roster.golferIds, expectedGolferIds);
      const gw2CaptainOk =
        gw2Roster &&
        (gw2Roster.captainId?.toString() || null) === (expectedCaptainId?.toString() || null);
      const gw2FullyOk = gw2GolfersOk && gw2CaptainOk;

      // If nothing needs fixing, skip
      if (!hasGW1Pending && gw2FullyOk) {
        alreadyOk++;
        continue;
      }

      const updateSet: Record<string, unknown> = { updatedAt: new Date() };
      const updateUnset: Record<string, string> = {};
      const changes: string[] = [];

      // === Fix 1: Apply live team fields (only if GW1 pending is still set) ===
      if (hasGW1Pending) {
        // Update golferIds to the post-transfer team
        if (!sameIds(pick.golferIds, expectedGolferIds)) {
          updateSet.golferIds = expectedGolferIds;

          const oldNames = pick.golferIds
            .map((id) => golferNames.get(id.toString()) || id)
            .join(', ');
          const newNames = expectedGolferIds
            .map((id) => golferNames.get(id.toString()) || id)
            .join(', ');
          changes.push(`   golferIds: [${oldNames}] → [${newNames}]`);

          // Recalculate totalSpent
          const newTotal = expectedGolferIds.reduce(
            (sum, id) => sum + (golferPrices.get(id.toString()) || 0),
            0
          );
          updateSet.totalSpent = newTotal;
        }

        // Update captain from the pickHistory entry (source of truth)
        const currentCaptainStr = pick.captainId?.toString() || null;
        const expectedCaptainStr = expectedCaptainId?.toString() || null;
        if (expectedCaptainStr && expectedCaptainStr !== currentCaptainStr) {
          updateSet.captainId = expectedCaptainId;
          const oldCap = currentCaptainStr ? golferNames.get(currentCaptainStr) : 'none';
          const newCap = expectedCaptainStr ? golferNames.get(expectedCaptainStr) : 'none';
          changes.push(`   captainId: ${oldCap} → ${newCap}`);
        } else if (!expectedCaptainStr && pick.captainId) {
          // Captain was swapped out and no new captain set — reassign to first golfer
          const captainOnNewTeam = expectedGolferIds.some(
            (id) => id.toString() === pick.captainId?.toString()
          );
          if (!captainOnNewTeam) {
            updateSet.captainId = expectedGolferIds[0];
            const oldCap = golferNames.get(pick.captainId.toString()) || 'unknown';
            const newCap = golferNames.get(expectedGolferIds[0].toString()) || 'unknown';
            changes.push(`   captainId: ${oldCap} (swapped out) → ${newCap} (auto-assigned)`);
          }
        }

        // Clear GW1 pending fields
        updateUnset.pendingGolferIds = '';
        updateUnset.pendingCaptainId = '';
        updateUnset.pendingChangedAt = '';
        changes.push('   Cleared: pendingGolferIds, pendingCaptainId, pendingChangedAt');
      } else if (!sameIds(pick.golferIds, expectedGolferIds)) {
        // ROSTER-ONLY path: golferIds is stale but pendingChangedAt was already cleared.
        // Only safe to fix if the user has NOT made any GW2+ changes (which would have
        // legitimately changed golferIds to something else).
        const gw2PlusHistory = await db.collection<PickHistoryDoc>('pickHistory').countDocuments({
          userId: new ObjectId(userId),
          season: seasonNum,
          changedAt: { $gte: GW2_DEADLINE },
        });

        if (gw2PlusHistory === 0) {
          updateSet.golferIds = expectedGolferIds;
          const oldNames = pick.golferIds
            .map((id) => golferNames.get(id.toString()) || id)
            .join(', ');
          const newNames = expectedGolferIds
            .map((id) => golferNames.get(id.toString()) || id)
            .join(', ');
          changes.push(
            `   golferIds: [${oldNames}] → [${newNames}] (no GW2+ activity, safe to fix)`
          );

          const newTotal = expectedGolferIds.reduce(
            (sum, id) => sum + (golferPrices.get(id.toString()) || 0),
            0
          );
          updateSet.totalSpent = newTotal;
        } else {
          changes.push(
            `   golferIds: ⚠️  stale but user has ${gw2PlusHistory} GW2+ changes — NOT touching`
          );
        }
      }

      // === Fix 2: Ensure gameweekRosters["2"] is correct ===
      if (!gw2FullyOk) {
        // Determine the correct captain for the GW2 roster
        let rosterCaptainId: ObjectId | null = expectedCaptainId;
        if (!rosterCaptainId) {
          // Try to use whatever captain we're setting on the live pick
          const liveCaptain = updateSet.captainId as ObjectId | undefined;
          rosterCaptainId = liveCaptain || pick.captainId || null;
          // Make sure captain is on the team
          if (rosterCaptainId) {
            const onTeam = expectedGolferIds.some(
              (id) => id.toString() === rosterCaptainId!.toString()
            );
            if (!onTeam) rosterCaptainId = null;
          }
        }

        const rosterEntry = {
          golferIds: expectedGolferIds,
          captainId: rosterCaptainId,
        };
        updateSet['gameweekRosters.2'] = rosterEntry;
        changes.push(`   gameweekRosters["2"]: ${gw2Roster ? 'fixed' : 'created'}`);
      }

      // === Fix 3: Update allGolferIds (union of all ever) ===
      const allIds = new Set<string>();
      if (pick.allGolferIds) {
        for (const id of pick.allGolferIds) allIds.add(id.toString());
      }
      for (const id of pick.golferIds) allIds.add(id.toString());
      for (const id of expectedGolferIds) allIds.add(id.toString());
      if (pick.gameweekRosters) {
        for (const roster of Object.values(pick.gameweekRosters)) {
          for (const id of roster.golferIds) allIds.add(id.toString());
        }
      }
      updateSet.allGolferIds = Array.from(allIds).map((id) => new ObjectId(id));

      // === Print changes ===
      const fixType = hasGW1Pending ? 'LIVE+ROSTER' : 'ROSTER-ONLY';
      console.log(
        `\n🔧 ${userName} [${fixType}] (transfer: ${new Date(transfer.changedAt).toISOString()})`
      );
      for (const change of changes) {
        console.log(change);
      }

      // === Apply ===
      if (!isDryRun) {
        const updateQuery: Record<string, unknown> = { $set: updateSet };
        if (Object.keys(updateUnset).length > 0) {
          updateQuery.$unset = updateUnset;
        }
        await db.collection<PickDoc>('picks').updateOne({ _id: pick._id }, updateQuery);
      }

      if (hasGW1Pending) {
        fixedLive++;
      } else {
        fixedRoster++;
      }
    }

    // === Summary ===
    console.log('\n' + '━'.repeat(70));
    console.log('SUMMARY');
    console.log('━'.repeat(70));
    console.log(`  Processed:         ${lastTransferByUser.size}`);
    console.log(`  Fixed (LIVE+ROSTER): ${fixedLive}`);
    console.log(`  Fixed (ROSTER-ONLY): ${fixedRoster}`);
    console.log(`  Already OK:        ${alreadyOk}`);
    console.log(`  Errors:            ${errors}`);

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN — no changes were made. Run with --apply to write changes.');
    } else {
      console.log('\n✅ All missed transfers applied!');
    }
    console.log('');
  } finally {
    await client.close();
  }
}

fix().catch((err) => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
