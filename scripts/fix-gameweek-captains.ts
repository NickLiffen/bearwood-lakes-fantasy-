// Fix script: Fill in missing GW1/GW2 captains
//
// pickHistory didn't store captainId before PR #52, so many users have
// no captain set for GW1. This script:
//   1. Uses current pick.captainId if that golfer is on the GW1/GW2 team
//   2. For Ashley Brinsford specifically, sets captain to herself for GW1
//      (confirmed by user)
//   3. Reports any users who still can't be resolved
//
// Usage:
//   npx tsx scripts/fix-gameweek-captains.ts           # Dry run
//   npx tsx scripts/fix-gameweek-captains.ts --apply    # Apply

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

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
  gameweekRosters?: Record<string, { golferIds: ObjectId[]; captainId: ObjectId | null }>;
  season: number;
}

async function fix() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set.');
    process.exit(1);
  }

  console.log(
    `\n🔧 Fix Gameweek Captains ${isDryRun ? '(DRY RUN)' : '(APPLYING CHANGES)'}\n`
  );

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    const picks = await db.collection<PickDoc>('picks').find({ season: 2026 }).toArray();

    // Get user names
    const userDocs = await db
      .collection('users')
      .find({ _id: { $in: picks.map((p) => p.userId) } })
      .project({ firstName: 1, lastName: 1, username: 1 })
      .toArray();
    const userNames = new Map(
      userDocs.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName} (@${u.username})`])
    );

    // Get golfer names
    const allGolferIds = new Set<string>();
    for (const p of picks) {
      if (p.gameweekRosters) {
        for (const r of Object.values(p.gameweekRosters)) {
          for (const id of r.golferIds) allGolferIds.add(id.toString());
        }
      }
      if (p.captainId) allGolferIds.add(p.captainId.toString());
    }
    const golferDocs = await db
      .collection('golfers')
      .find({ _id: { $in: Array.from(allGolferIds).map((id) => new ObjectId(id)) } })
      .project({ firstName: 1, lastName: 1 })
      .toArray();
    const golferNames = new Map(
      golferDocs.map((g) => [g._id.toString(), `${g.firstName} ${g.lastName}`])
    );

    // Find the golfer ID for "Ashley Brinsford" (user confirmed she captained herself in GW1)
    const ashleyGolfer = golferDocs.find(
      (g) => g.firstName === 'Ashley' && g.lastName === 'Brinsford'
    );
    const ashleyGolferId = ashleyGolfer?._id.toString() || null;

    let fixed = 0;
    let unchanged = 0;
    const unresolvable: string[] = [];

    for (const pick of picks) {
      const userId = pick.userId.toString();
      const userName = userNames.get(userId) || userId;
      if (userName.includes('@admin')) { unchanged++; continue; }

      const rosters = pick.gameweekRosters;
      if (!rosters) { unchanged++; continue; }

      let changed = false;
      const updates: Record<string, unknown> = {};

      for (const gwKey of ['1', '2']) {
        const roster = rosters[gwKey];
        if (!roster) continue;

        // Already has a captain — skip
        if (roster.captainId) continue;

        const golferIds = roster.golferIds.map((id) => id.toString());
        let newCaptainId: string | null = null;

        // Special case: Ashley Brinsford captained herself in GW1
        if (userName.includes('@ashley_brinsford') && gwKey === '1' && ashleyGolferId) {
          if (golferIds.includes(ashleyGolferId)) {
            newCaptainId = ashleyGolferId;
          }
        }

        // General fallback: use current pick.captainId if that golfer is on this GW team
        if (!newCaptainId && pick.captainId) {
          const currentCaptainStr = pick.captainId.toString();
          if (golferIds.includes(currentCaptainStr)) {
            newCaptainId = currentCaptainStr;
          }
        }

        if (newCaptainId) {
          const captainName = golferNames.get(newCaptainId) || newCaptainId;
          console.log(
            `🔧 ${userName}: GW${gwKey} captain set to ${captainName}`
          );
          updates[`gameweekRosters.${gwKey}.captainId`] = new ObjectId(newCaptainId);
          changed = true;
        } else {
          // Truly unresolvable — no current captain or captain not on team
          unresolvable.push(`${userName} GW${gwKey}`);
        }
      }

      if (changed) {
        updates.updatedAt = new Date();
        if (!isDryRun) {
          await db
            .collection<PickDoc>('picks')
            .updateOne({ _id: pick._id }, { $set: updates });
        }
        fixed++;
      } else {
        unchanged++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Unchanged: ${unchanged}`);
    console.log(`  Unresolvable (no captain data): ${unresolvable.length}`);

    if (unresolvable.length > 0) {
      console.log('\n⚠️  Users with no captain that could not be auto-resolved:');
      for (const entry of unresolvable) {
        console.log(`   - ${entry}`);
      }
      console.log(
        '\n   These users either never set a captain or their captain is not on the team.'
      );
      console.log('   They will have no 2x multiplier for those gameweeks.');
    }

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN — no changes were made. Run with --apply to write changes.');
    } else {
      console.log('\n✅ Captain fix complete!');
    }
  } finally {
    await client.close();
  }
}

fix().catch((err) => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
