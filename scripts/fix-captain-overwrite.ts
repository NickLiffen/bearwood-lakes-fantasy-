// Fix script: Correct GW2 rosters where a Scheduled captain change
// overwrote the golferIds from a preceding Scheduled transfer.
//
// Bug: When a user made a transfer then immediately changed captain during
// GW1, the captain change pickHistory entry recorded the PRE-TRANSFER
// golferIds. Since apply-missed-gw1-transfers.ts used the LAST scheduled
// entry as truth, 12 users got the wrong GW2 roster.
//
// Fix: For users with both a Scheduled transfer and a subsequent Scheduled
// captain change, use golferIds from the transfer + captainId from the
// captain change. Also fix golferIds on the live pick when safe.
//
// Usage:
//   npx tsx scripts/fix-captain-overwrite.ts           # Dry run
//   npx tsx scripts/fix-captain-overwrite.ts --apply    # Apply

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';
const isDryRun = !process.argv.includes('--apply');

function getSeasonFirstSaturday(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameIds(a: ObjectId[], b: ObjectId[]): boolean {
  const setA = new Set(a.map((id) => id.toString()));
  const setB = new Set(b.map((id) => id.toString()));
  if (setA.size !== setB.size) return false;
  for (const id of Array.from(setA)) if (!setB.has(id)) return false;
  return true;
}

async function fix() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set.');
    process.exit(1);
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    const season = await db.collection('seasons').findOne({ isActive: true }) as any;
    if (!season) { console.error('❌ No active season.'); process.exit(1); }

    const seasonNum = parseInt(season.name, 10) || new Date().getFullYear();
    const GW1_START = season.firstGameweekStart
      ? new Date(season.firstGameweekStart)
      : getSeasonFirstSaturday(new Date(season.startDate));
    const firstSat = getSeasonFirstSaturday(GW1_START);
    const GW2_DEADLINE = new Date(firstSat);
    GW2_DEADLINE.setDate(GW2_DEADLINE.getDate() + 7);
    GW2_DEADLINE.setHours(8, 0, 0, 0);

    console.log(`\n🔧 Fix Captain-Overwrite Bug ${isDryRun ? '(DRY RUN)' : '(APPLYING CHANGES)'}\n`);

    // Get all GW1 scheduled entries
    const entries = await db.collection('pickHistory').find({
      season: seasonNum,
      changedAt: { $gte: GW1_START, $lt: GW2_DEADLINE },
      reason: { $in: ['Scheduled transfer', 'Scheduled captain change'] },
    }).sort({ changedAt: 1 }).toArray();

    // Group by user
    const byUser = new Map<string, any[]>();
    for (const e of entries) {
      const uid = e.userId.toString();
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid)!.push(e);
    }

    // Get names
    const golferDocs = await db.collection('golfers').find({}).toArray();
    const golferNames = new Map(golferDocs.map((g: any) => [g._id.toString(), `${g.firstName} ${g.lastName}`]));
    const golferPrices = new Map(golferDocs.map((g: any) => [g._id.toString(), (g.price as number) || 0]));
    const userDocs = await db.collection('users').find({}).project({ firstName: 1, lastName: 1, username: 1 }).toArray();
    const userNames = new Map(userDocs.map((u: any) => [u._id.toString(), `${u.firstName} ${u.lastName} (@${u.username})`]));

    let fixed = 0;

    for (const [userId, userEntries] of Array.from(byUser)) {
      // Find last transfer followed by captain change with different golferIds
      let lastTransfer: any = null;
      let captainAfterTransfer: any = null;

      for (const e of userEntries) {
        if (e.reason === 'Scheduled transfer') {
          lastTransfer = e;
          captainAfterTransfer = null;
        } else if (e.reason === 'Scheduled captain change' && lastTransfer) {
          captainAfterTransfer = e;
        }
      }

      if (!lastTransfer || !captainAfterTransfer) continue;
      if (sameIds(lastTransfer.golferIds, captainAfterTransfer.golferIds)) continue;

      const userName = userNames.get(userId) || userId;

      // Correct state: golferIds from transfer, captainId from captain change
      const correctGolferIds = lastTransfer.golferIds as ObjectId[];
      const correctCaptainId = captainAfterTransfer.captainId || null;

      const pick = await db.collection('picks').findOne({
        userId: new ObjectId(userId),
        season: seasonNum,
      }) as any;
      if (!pick) continue;

      const updateSet: Record<string, unknown> = { updatedAt: new Date() };
      const changes: string[] = [];

      // Fix gameweekRosters["2"]
      const rosterEntry = {
        golferIds: correctGolferIds,
        captainId: correctCaptainId,
      };
      updateSet['gameweekRosters.2'] = rosterEntry;
      const rosterNames = correctGolferIds.map((id: any) => golferNames.get(id.toString()) || id).join(', ');
      const capName = correctCaptainId ? golferNames.get(correctCaptainId.toString()) || 'unknown' : 'none';
      changes.push(`   gameweekRosters["2"]: [${rosterNames}] captain: ${capName}`);

      // Fix golferIds if no GW2+ activity
      if (!sameIds(pick.golferIds, correctGolferIds)) {
        const gw2PlusCount = await db.collection('pickHistory').countDocuments({
          userId: new ObjectId(userId),
          season: seasonNum,
          changedAt: { $gte: GW2_DEADLINE },
        });

        if (gw2PlusCount === 0) {
          updateSet.golferIds = correctGolferIds;
          const newTotal = correctGolferIds.reduce(
            (sum: number, id: any) => sum + (golferPrices.get(id.toString()) || 0), 0
          );
          updateSet.totalSpent = newTotal;
          const oldNames = pick.golferIds.map((id: any) => golferNames.get(id.toString()) || id).join(', ');
          changes.push(`   golferIds: [${oldNames}] → [${rosterNames}]`);
        } else {
          changes.push(`   golferIds: ⚠️  stale but ${gw2PlusCount} GW2+ changes — NOT touching`);
        }
      }

      // Update allGolferIds
      const allIds = new Set<string>();
      if (pick.allGolferIds) for (const id of pick.allGolferIds) allIds.add(id.toString());
      for (const id of pick.golferIds) allIds.add(id.toString());
      for (const id of correctGolferIds) allIds.add(id.toString());
      if (pick.gameweekRosters) {
        for (const r of Object.values(pick.gameweekRosters) as any[]) {
          for (const id of r.golferIds) allIds.add(id.toString());
        }
      }
      updateSet.allGolferIds = Array.from(allIds).map((id) => new ObjectId(id));

      console.log(`\n🔧 ${userName}`);
      for (const c of changes) console.log(c);

      if (!isDryRun) {
        await db.collection('picks').updateOne({ _id: pick._id }, { $set: updateSet });
      }
      fixed++;
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Fixed: ${fixed}`);
    if (isDryRun) {
      console.log('⚠️  DRY RUN — no changes made. Run with --apply to write.');
    } else {
      console.log('✅ Done!');
    }
    console.log('');
  } finally {
    await client.close();
  }
}

fix().catch((err) => { console.error('❌ Failed:', err); process.exit(1); });
