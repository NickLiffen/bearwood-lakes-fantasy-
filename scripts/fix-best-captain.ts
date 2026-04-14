// Fix script: Assign highest-scoring golfer as captain for users with no captain
//
// For users who never set a captain, picks the golfer on their team with the
// most multipliedPoints in the relevant gameweek period as captain.
//
// Usage:
//   npx tsx scripts/fix-best-captain.ts           # Dry run
//   npx tsx scripts/fix-best-captain.ts --apply    # Apply

import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';
const isDryRun = !process.argv.includes('--apply');

async function fix() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set.');
    process.exit(1);
  }

  console.log(
    `\n🔧 Assign Best-Golfer Captains ${isDryRun ? '(DRY RUN)' : '(APPLYING CHANGES)'}\n`
  );

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    const picks = await db.collection('picks').find({ season: 2026 }).toArray();

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
    const golferDocs = await db.collection('golfers').find({}).project({ firstName: 1, lastName: 1 }).toArray();
    const golferNames = new Map(
      golferDocs.map((g) => [g._id.toString(), `${g.firstName} ${g.lastName}`])
    );

    // Get season for date boundaries
    const season = await db.collection('seasons').findOne({ isActive: true });
    const firstGW = season?.firstGameweekStart ? new Date(season.firstGameweekStart) : null;

    // GW date boundaries for score lookups
    // GW1: Apr 3 -> Apr 11 (using firstGameweekStart)
    // GW2: Apr 11 -> Apr 18
    const GW1_START = firstGW || new Date('2026-04-03T07:00:00.000Z');
    const GW1_END = new Date('2026-04-11T00:00:00.000Z');
    const GW2_END = new Date('2026-04-18T00:00:00.000Z');

    // Get all scores with tournament dates
    const scores = await db.collection('scores').find({}).toArray();
    const tournaments = await db.collection('tournaments').find({}).project({ date: 1 }).toArray();
    const tournamentDates = new Map(
      tournaments.map((t) => [t._id.toString(), new Date(t.date)])
    );

    // Build golfer -> total points per gameweek
    // GW1 scores: tournaments with date in GW1 range
    // GW2 scores: tournaments with date in GW2 range
    const gw1Points = new Map<string, number>(); // golferId -> total points in GW1
    const gw2Points = new Map<string, number>(); // golferId -> total points in GW2

    for (const score of scores) {
      const golferId = score.golferId.toString();
      const tournDate = tournamentDates.get(score.tournamentId.toString());
      if (!tournDate) continue;

      const points = score.multipliedPoints || 0;

      if (tournDate >= GW1_START && tournDate < GW1_END) {
        gw1Points.set(golferId, (gw1Points.get(golferId) || 0) + points);
      }
      if (tournDate >= GW1_END && tournDate < GW2_END) {
        gw2Points.set(golferId, (gw2Points.get(golferId) || 0) + points);
      }
    }

    let fixed = 0;
    let unchanged = 0;

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
        if (roster.captainId) continue; // Already has captain

        const golferIds = roster.golferIds.map((id: any) => id.toString());
        const pointsMap = gwKey === '1' ? gw1Points : gw2Points;

        // Find highest-scoring golfer on this team
        let bestId: string | null = null;
        let bestPoints = -1;

        for (const gid of golferIds) {
          const pts = pointsMap.get(gid) || 0;
          if (pts > bestPoints) {
            bestPoints = pts;
            bestId = gid;
          }
        }

        // If all scored 0, just pick the first golfer
        if (!bestId && golferIds.length > 0) {
          bestId = golferIds[0];
          bestPoints = 0;
        }

        if (bestId) {
          const captainName = golferNames.get(bestId) || bestId;
          console.log(
            `🔧 ${userName}: GW${gwKey} captain → ${captainName} (${bestPoints} pts in GW${gwKey})`
          );
          updates[`gameweekRosters.${gwKey}.captainId`] = new ObjectId(bestId);
          changed = true;
        }
      }

      if (changed) {
        updates.updatedAt = new Date();
        if (!isDryRun) {
          await db.collection('picks').updateOne({ _id: pick._id }, { $set: updates });
        }
        fixed++;
      } else {
        unchanged++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Unchanged: ${unchanged}`);

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN — no changes were made. Run with --apply to write changes.');
    } else {
      console.log('\n✅ Best-golfer captain fix complete!');
    }
  } finally {
    await client.close();
  }
}

fix().catch((err) => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
