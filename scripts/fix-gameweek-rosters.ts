// Fix script: Correct gameweekRosters for GW1 and GW2
// Reconstructs per-gameweek rosters from pickHistory audit trail.
//
// The migration script (migrate-gameweek-rosters.ts) had a bug where pre-season
// team changes were assigned to negative gameweek numbers instead of GW1.
// This script fixes the corrupt data by:
//   1. Finding the last team before GW1 started → sets as GW1 roster
//   2. Finding scheduled transfers during GW1 → sets as GW2 roster
//   3. Preserving GW3+ rosters set by the live application code
//   4. Removing negative/zero gameweek keys
//   5. Recalculating allGolferIds
//
// Usage:
//   npx tsx scripts/fix-gameweek-rosters.ts           # Dry run (preview changes)
//   npx tsx scripts/fix-gameweek-rosters.ts --apply    # Apply changes

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
  allGolferIds?: ObjectId[];
  pendingGolferIds?: ObjectId[];
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

// Helper: get the first Saturday on or after a date
function getSeasonFirstSaturday(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper: compare two rosters (golferIds + captain)
function rostersEqual(
  a: { golferIds: ObjectId[]; captainId: ObjectId | null } | undefined,
  b: { golferIds: ObjectId[]; captainId: ObjectId | null } | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const aSet = new Set(a.golferIds.map((id) => id.toString()));
  const bSet = new Set(b.golferIds.map((id) => id.toString()));
  if (aSet.size !== bSet.size) return false;
  for (const id of aSet) if (!bSet.has(id)) return false;
  const aCap = a.captainId?.toString() || '';
  const bCap = b.captainId?.toString() || '';
  return aCap === bCap;
}

async function fix() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set. Please set it as an environment variable.');
    process.exit(1);
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  // Derive GW boundaries from the active season config
  const season = await db.collection<SeasonDoc>('seasons').findOne({ isActive: true });
  if (!season) {
    console.error('❌ No active season found.');
    process.exit(1);
  }

  const firstGWConfig = season.firstGameweekStart
    ? new Date(season.firstGameweekStart)
    : null;

  // GW1 start = firstGameweekStart (or first Saturday of season)
  const GW1_START = firstGWConfig || getSeasonFirstSaturday(new Date(season.startDate));

  // GW2 start = the Saturday 7 days after the first Saturday on or after GW1, at 00:00
  const firstSat = getSeasonFirstSaturday(GW1_START);
  const GW2_START = new Date(firstSat);
  GW2_START.setDate(GW2_START.getDate() + 7);
  GW2_START.setHours(0, 0, 0, 0);

  console.log(
    `\n🔧 Fix Gameweek Rosters ${isDryRun ? '(DRY RUN)' : '(APPLYING CHANGES)'}\n`
  );
  console.log(`📅 Season: ${season.name}`);
  console.log(`📅 firstGameweekStart (from DB): ${firstGWConfig?.toISOString() || 'not set'}`);
  console.log(`📅 GW1: ${GW1_START.toISOString()} → ${GW2_START.toISOString()}`);
  const gw3Start = new Date(GW2_START);
  gw3Start.setDate(gw3Start.getDate() + 7);
  console.log(`📅 GW2: ${GW2_START.toISOString()} → ${gw3Start.toISOString()}`);
  console.log('');

  const seasonNum = parseInt(season.name, 10) || new Date().getFullYear();

  try {
    // Get all picks for this season
    const picks = await db.collection<PickDoc>('picks').find({ season: seasonNum }).toArray();
    console.log(`👥 Found ${picks.length} picks to process\n`);

    // Get all pick history sorted chronologically
    const allHistory = await db
      .collection<PickHistoryDoc>('pickHistory')
      .find({ season: seasonNum })
      .sort({ changedAt: 1 })
      .toArray();

    // Group history by user
    const historyByUser = new Map<string, PickHistoryDoc[]>();
    for (const entry of allHistory) {
      const uid = entry.userId.toString();
      if (!historyByUser.has(uid)) historyByUser.set(uid, []);
      historyByUser.get(uid)!.push(entry);
    }

    // Get golfer names for display
    const allGolferIdSet = new Set<string>();
    for (const p of picks) {
      for (const id of p.golferIds) allGolferIdSet.add(id.toString());
      if (p.allGolferIds) {
        for (const id of p.allGolferIds) allGolferIdSet.add(id.toString());
      }
      if (p.gameweekRosters) {
        for (const r of Object.values(p.gameweekRosters)) {
          for (const id of r.golferIds) allGolferIdSet.add(id.toString());
        }
      }
    }
    for (const entries of historyByUser.values()) {
      for (const e of entries) {
        for (const id of e.golferIds) allGolferIdSet.add(id.toString());
      }
    }

    const golferDocs = await db
      .collection('golfers')
      .find({ _id: { $in: Array.from(allGolferIdSet).map((id) => new ObjectId(id)) } })
      .project({ firstName: 1, lastName: 1 })
      .toArray();
    const golferNames = new Map(
      golferDocs.map((g) => [g._id.toString(), `${g.firstName} ${g.lastName}`])
    );

    // Get user names for display
    const userIds = picks.map((p) => p.userId);
    const userDocs = await db
      .collection('users')
      .find({ _id: { $in: userIds } })
      .project({ firstName: 1, lastName: 1, username: 1 })
      .toArray();
    const userNames = new Map(
      userDocs.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName} (@${u.username})`])
    );

    let fixed = 0;
    let unchanged = 0;
    let noHistory = 0;

    for (const pick of picks) {
      const userId = pick.userId.toString();
      const userName = userNames.get(userId) || userId;
      const userHistory = historyByUser.get(userId) || [];

      // Skip admin user
      if (userName.includes('@admin')) {
        unchanged++;
        continue;
      }

      // === Determine if this team existed before GW1 ===
      const pickCreatedAt = new Date(pick.createdAt);
      const firstHistoryDate = userHistory.length > 0
        ? new Date(userHistory[0].changedAt)
        : pickCreatedAt;
      const teamExistedBeforeGW1 = firstHistoryDate < GW1_START || pickCreatedAt < GW1_START;
      const teamExistedBeforeGW2 = firstHistoryDate < GW2_START || pickCreatedAt < GW2_START;

      // === Step 1: Determine correct GW1 roster ===
      let gw1Golfers: ObjectId[] | null = null;
      let gw1Captain: ObjectId | null = null;

      if (teamExistedBeforeGW1) {
        // Team was created before GW1 — find last team set before GW1 started
        for (const entry of userHistory) {
          const changedAt = new Date(entry.changedAt);
          if (changedAt < GW1_START) {
            gw1Golfers = entry.golferIds;
            gw1Captain = entry.captainId || null;
          }
        }

        // Fallback: if history started before GW1 but we have no entries (shouldn't happen)
        if (!gw1Golfers) {
          gw1Golfers = pick.golferIds;
          gw1Captain = pick.captainId || null;
          noHistory++;
        }
      } else if (teamExistedBeforeGW2) {
        // Team was created during GW1 — use the first history entry as GW1
        if (userHistory.length > 0) {
          gw1Golfers = userHistory[0].golferIds;
          gw1Captain = userHistory[0].captainId || null;
        } else {
          gw1Golfers = pick.golferIds;
          gw1Captain = pick.captainId || null;
          noHistory++;
        }
      } else {
        // Team was created at or after GW2 — don't fabricate GW1/GW2 rosters
        // Only clean up negative keys if present, then skip
        if (pick.gameweekRosters) {
          const hasNegativeKeys = Object.keys(pick.gameweekRosters).some((k) => Number(k) <= 0);
          if (hasNegativeKeys) {
            const cleanedRosters: Record<string, { golferIds: ObjectId[]; captainId: ObjectId | null }> = {};
            for (const [k, v] of Object.entries(pick.gameweekRosters)) {
              if (Number(k) > 0) cleanedRosters[k] = v;
            }
            if (!isDryRun) {
              await db.collection<PickDoc>('picks').updateOne(
                { _id: pick._id },
                { $set: { gameweekRosters: cleanedRosters, updatedAt: new Date() } }
              );
            }
            console.log(`🧹 ${userName}: Cleaned negative keys only (team created after GW2)\n`);
            fixed++;
          } else {
            unchanged++;
          }
        } else {
          unchanged++;
        }
        continue;
      }

      // === Step 2: Determine correct GW2 roster ===
      let gw2Golfers = gw1Golfers;
      let gw2Captain = gw1Captain;
      let hasGW2Transfer = false;

      for (const entry of userHistory) {
        const changedAt = new Date(entry.changedAt);

        if (changedAt >= GW1_START && changedAt < GW2_START) {
          if (
            entry.reason === 'Scheduled transfer' ||
            entry.reason === 'Scheduled captain change'
          ) {
            // Deferred transfer → takes effect at GW2
            gw2Golfers = entry.golferIds;
            gw2Captain = entry.captainId || null;
            hasGW2Transfer = true;
          } else if (
            entry.reason === 'Team selection' ||
            entry.reason === 'Captain change'
          ) {
            // Immediate change during GW1 (unlimited transfers for new teams)
            // Log as exceptional for visibility
            console.log(`   ⚠️  Immediate "${entry.reason}" during GW1 at ${changedAt.toISOString()}`);
            gw1Golfers = entry.golferIds;
            gw1Captain = entry.captainId || null;
            if (!hasGW2Transfer) {
              gw2Golfers = entry.golferIds;
              gw2Captain = entry.captainId || null;
            }
          }
        }
      }

      // === Step 3: Handle captains ===
      // pickHistory entries before PR #52 may not have captainId.
      // Try existing gameweekRosters captain first (if the captain is on the team),
      // then fall back to null. We do NOT use current pick.captainId as historical
      // truth since it may reflect a future captain assignment.
      if (!gw1Captain) {
        const existingGW1Captain = pick.gameweekRosters?.['1']?.captainId;
        if (existingGW1Captain) {
          const captainOnTeam = gw1Golfers.some(
            (id) => id.toString() === existingGW1Captain.toString()
          );
          if (captainOnTeam) {
            gw1Captain = existingGW1Captain;
          }
        }
      }
      if (!gw2Captain) {
        const existingGW2Captain = pick.gameweekRosters?.['2']?.captainId;
        if (existingGW2Captain) {
          const captainOnTeam = gw2Golfers.some(
            (id) => id.toString() === existingGW2Captain.toString()
          );
          if (captainOnTeam) {
            gw2Captain = existingGW2Captain;
          }
        }
        // If still no captain for GW2, inherit from GW1 if on the team
        if (!gw2Captain && gw1Captain) {
          const captainOnGW2 = gw2Golfers.some(
            (id) => id.toString() === gw1Captain!.toString()
          );
          if (captainOnGW2) {
            gw2Captain = gw1Captain;
          }
        }
      }

      // === Step 4: Build new gameweekRosters ===
      const newRosters: Record<string, { golferIds: ObjectId[]; captainId: ObjectId | null }> = {};
      const newGW1 = { golferIds: gw1Golfers, captainId: gw1Captain };
      const newGW2 = { golferIds: gw2Golfers, captainId: gw2Captain };

      newRosters['1'] = newGW1;

      // Set GW2 only if different from GW1 (sparse storage with carry-forward)
      if (!rostersEqual(newGW1, newGW2)) {
        newRosters['2'] = newGW2;
      }

      // Preserve GW3+ rosters from the existing data (set by live application code)
      if (pick.gameweekRosters) {
        for (const [gwKey, roster] of Object.entries(pick.gameweekRosters)) {
          const gwNum = Number(gwKey);
          if (gwNum >= 3) {
            newRosters[gwKey] = roster;
          }
        }
      }

      // === Step 5: Recalculate allGolferIds ===
      const allIds = new Set<string>();
      for (const roster of Object.values(newRosters)) {
        for (const id of roster.golferIds) {
          allIds.add(id.toString());
        }
      }
      for (const id of pick.golferIds) {
        allIds.add(id.toString());
      }
      if (pick.pendingGolferIds) {
        for (const id of pick.pendingGolferIds) {
          allIds.add(id.toString());
        }
      }
      const newAllGolferIds = Array.from(allIds).map((id) => new ObjectId(id));

      // === Step 6: Check if anything actually changed ===
      const oldGW1 = pick.gameweekRosters?.['1'];
      const oldGW2 = pick.gameweekRosters?.['2'];
      const hasNegativeKeys = pick.gameweekRosters
        ? Object.keys(pick.gameweekRosters).some((k) => Number(k) <= 0)
        : false;

      const gw1Changed = !rostersEqual(oldGW1, newGW1);
      const gw2Changed = !rostersEqual(oldGW2, newRosters['2'] || undefined);

      if (!gw1Changed && !gw2Changed && !hasNegativeKeys) {
        unchanged++;
        continue;
      }

      // === Display changes ===
      const gw1Names = gw1Golfers.map((id) => golferNames.get(id.toString()) || id.toString());
      const captainName = gw1Captain
        ? golferNames.get(gw1Captain.toString()) || gw1Captain.toString()
        : 'none';

      console.log(`🔧 ${userName}:`);

      if (oldGW1) {
        const oldNames = oldGW1.golferIds
          .map((id) => golferNames.get(id.toString()) || id.toString())
          .join(', ');
        console.log(`   OLD GW1: [${oldNames}]`);
      }
      console.log(`   NEW GW1: [${gw1Names.join(', ')}] captain: ${captainName}`);

      if (newRosters['2']) {
        const gw2Names = gw2Golfers
          .map((id) => golferNames.get(id.toString()) || id.toString())
          .join(', ');
        const gw2CaptainName = gw2Captain
          ? golferNames.get(gw2Captain.toString()) || gw2Captain.toString()
          : 'none';
        console.log(`   NEW GW2: [${gw2Names}] captain: ${gw2CaptainName}`);
      } else {
        console.log(`   GW2: same as GW1 (no transfer during GW1)`);
      }

      if (hasNegativeKeys) {
        const negKeys = Object.keys(pick.gameweekRosters!)
          .filter((k) => Number(k) <= 0)
          .join(', ');
        console.log(`   🗑️  Removing negative/zero keys: [${negKeys}]`);
      }

      const preservedGWs = Object.keys(newRosters).filter((k) => Number(k) >= 3);
      if (preservedGWs.length > 0) {
        console.log(`   ✅ Preserved GW${preservedGWs.join(', GW')} rosters`);
      }

      console.log('');

      // === Step 7: Apply the fix ===
      if (!isDryRun) {
        await db.collection<PickDoc>('picks').updateOne(
          { _id: pick._id },
          {
            $set: {
              gameweekRosters: newRosters,
              allGolferIds: newAllGolferIds,
              updatedAt: new Date(),
            },
          }
        );
      }

      fixed++;
    }

    console.log('\n📊 Summary:');
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Unchanged: ${unchanged}`);
    console.log(`  No history: ${noHistory}`);
    console.log(`  Total: ${picks.length}`);

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN — no changes were made. Run with --apply to write changes.');
    } else {
      console.log('\n✅ Fix complete!');
    }
  } finally {
    await client.close();
  }
}

fix().catch((err) => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
