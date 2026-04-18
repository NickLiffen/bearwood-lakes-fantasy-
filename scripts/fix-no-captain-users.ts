// Remediation: restore captainId for users whose picks.captainId is null in
// the active season.
//
// Context: Ed Saliba (and 6 other users in season 2026) ended up with
// captainId:null due to (a) a frontend toggle bug where clicking the active
// captain silently set null, and (b) a backend apply path that honoured
// explicit null. Both are fixed in the companion PR. This script repairs the
// legacy data.
//
// Strategy (per user, priority order):
//   1. Ed-style recovery from pickHistory:
//      look for a recent (≤ 14 day) entry that set a non-null captain,
//      followed within 60 seconds by an entry that wiped it to null, where the
//      originally chosen captain is still on the user's current team. Restore
//      to that golfer.
//   2. gameweekRosters[1].captainId fallback:
//      if a GW1 roster snapshot exists and its captain is still on the team,
//      restore that.
//   3. Skip and log for manual review.
//
// For every applied fix we write a pickHistory audit entry with
// reason: 'Admin correction: restored captain (no-captain bug fix)' and update
// both picks.captainId and picks.gameweekRosters[currentGw].captainId. An
// optimistic lock on updatedAt prevents clobbering concurrent user writes.
//
// Usage:
//   npx tsx scripts/fix-no-captain-users.ts              # dry run (default)
//   npx tsx scripts/fix-no-captain-users.ts --execute    # apply changes
//   npx tsx scripts/fix-no-captain-users.ts --users=id1,id2  # limit to specific userIds
//
// Required env: MONGODB_URI, MONGODB_DB_NAME (from .env.local)

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const usersArg = args.find((a) => a.startsWith('--users='));
const userFilter = usersArg ? usersArg.substring('--users='.length).split(',').filter(Boolean) : [];

const ED_STYLE_WINDOW_MS = 60_000; // set-then-wipe considered a bug within this window
const RECENT_WINDOW_DAYS = 14;

interface SeasonDoc {
  _id: ObjectId;
  name: string;
  startDate?: Date;
  firstGameweekStart?: Date;
  isActive?: boolean;
}

interface GolferDoc {
  _id: ObjectId;
  firstName: string;
  lastName: string;
}

interface UserDoc {
  _id: ObjectId;
  firstName?: string;
  lastName?: string;
  username: string;
}

interface PickHistoryEntry {
  _id: ObjectId;
  userId: ObjectId;
  season: number;
  reason: string;
  changedAt: Date;
  golferIds: ObjectId[];
  captainId?: ObjectId | null;
  totalSpent?: number;
}

interface GameweekRoster {
  golferIds: ObjectId[];
  captainId?: ObjectId | null;
}

interface PickDoc {
  _id: ObjectId;
  userId: ObjectId;
  season: number;
  golferIds: ObjectId[];
  captainId?: ObjectId | null;
  totalSpent?: number;
  gameweekRosters?: Record<string, GameweekRoster>;
  updatedAt?: Date;
}

function getSeasonFirstSaturday(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Mirror of netlify/functions/_shared/utils/dates.ts:getWeekStart — normalises
// to midnight of the preceding Saturday so GW arithmetic is time-of-day safe.
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  // Saturday = 6; diff to the previous Saturday
  const diffToSaturday = (day + 1) % 7;
  d.setDate(d.getDate() - diffToSaturday);
  return d;
}

function getCurrentGameweek(seasonStart: Date, firstGameweekStart: Date | null): number {
  // Normalise both anchor and "now" to their week-start (Saturday midnight)
  // so that a firstGameweekStart like 2026-04-04 08:00 produces the same GW
  // number as the backend's getGameweekNumber helper.
  const anchor = firstGameweekStart
    ? getWeekStart(firstGameweekStart)
    : getWeekStart(getSeasonFirstSaturday(seasonStart));
  const nowWeekStart = getWeekStart(new Date());
  const diffMs = nowWeekStart.getTime() - anchor.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

interface Decision {
  userId: ObjectId;
  userName: string;
  restoredCaptainId: ObjectId;
  strategy: 'ed-style' | 'roster-gw1';
  evidence: string;
}

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set.');
    process.exit(1);
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    const season = await db.collection<SeasonDoc>('seasons').findOne({ isActive: true });
    if (!season || !season.startDate) {
      console.error('❌ No active season or missing startDate.');
      process.exit(1);
    }
    const seasonNum = parseInt(season.name, 10) || new Date().getFullYear();
    const currentGW = getCurrentGameweek(
      new Date(season.startDate),
      season.firstGameweekStart ? new Date(season.firstGameweekStart) : null
    );

    console.log(
      `\n🔧 Restore Captain for No-Captain Users — season ${seasonNum} (GW${currentGW})`
    );
    console.log(`   Mode: ${isExecute ? '🟢 EXECUTE' : '🟡 DRY RUN'}`);
    if (userFilter.length > 0) console.log(`   Limit: ${userFilter.length} user(s)`);
    console.log('');

    // 1. Find candidate picks
    const query: Record<string, unknown> = {
      season: seasonNum,
      captainId: null,
    };
    if (userFilter.length > 0) {
      query.userId = { $in: userFilter.map((id) => new ObjectId(id)) };
    }
    const candidates = await db.collection<PickDoc>('picks').find(query).toArray();

    if (candidates.length === 0) {
      console.log('✅ No users with captainId=null in the active season. Nothing to do.');
      await client.close();
      return;
    }

    // 2. Lookup names for nicer logs
    const userIds = candidates.map((p) => p.userId);
    const allGolferIds = new Set<string>();
    for (const p of candidates) {
      for (const g of p.golferIds) allGolferIds.add(g.toString());
    }
    const userDocs = await db
      .collection<UserDoc>('users')
      .find({ _id: { $in: userIds } })
      .project<UserDoc>({ firstName: 1, lastName: 1, username: 1 })
      .toArray();
    const userNames = new Map(
      userDocs.map((u) => [u._id.toString(), `${u.firstName ?? ''} ${u.lastName ?? ''} (@${u.username})`.trim()])
    );
    const golferDocs = await db
      .collection<GolferDoc>('golfers')
      .find({ _id: { $in: Array.from(allGolferIds).map((id) => new ObjectId(id)) } })
      .toArray();
    const golferNames = new Map(
      golferDocs.map((g) => [g._id.toString(), `${g.firstName} ${g.lastName}`])
    );

    // 3. Build decisions
    const decisions: Decision[] = [];
    const skipped: Array<{ userId: string; userName: string; reason: string }> = [];

    const recentCutoff = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    for (const pick of candidates) {
      const userId = pick.userId;
      const userName = userNames.get(userId.toString()) || userId.toString();
      const teamIds = new Set(pick.golferIds.map((id) => id.toString()));

      // Strategy 1: Ed-style — look at pickHistory for set-then-wipe
      const history = await db
        .collection<PickHistoryEntry>('pickHistory')
        .find({ userId, season: seasonNum, changedAt: { $gte: recentCutoff } })
        .sort({ changedAt: 1 })
        .toArray();

      let edRestore: ObjectId | null = null;
      let edEvidence = '';
      for (let i = 0; i < history.length - 1; i++) {
        const setEntry = history[i];
        const wipeEntry = history[i + 1];
        if (!setEntry.captainId) continue;
        if (wipeEntry.captainId !== null && wipeEntry.captainId !== undefined) continue;
        const deltaMs = wipeEntry.changedAt.getTime() - setEntry.changedAt.getTime();
        if (deltaMs > ED_STYLE_WINDOW_MS) continue;
        if (!teamIds.has(setEntry.captainId.toString())) continue;
        edRestore = setEntry.captainId;
        edEvidence = `set ${setEntry.changedAt.toISOString()} → wipe ${wipeEntry.changedAt.toISOString()} (${Math.round(deltaMs / 1000)}s apart)`;
      }

      if (edRestore) {
        decisions.push({
          userId,
          userName,
          restoredCaptainId: edRestore,
          strategy: 'ed-style',
          evidence: edEvidence,
        });
        continue;
      }

      // Strategy 2: GW1 roster fallback
      const gw1Captain = pick.gameweekRosters?.['1']?.captainId;
      if (gw1Captain && teamIds.has(gw1Captain.toString())) {
        decisions.push({
          userId,
          userName,
          restoredCaptainId: gw1Captain,
          strategy: 'roster-gw1',
          evidence: `gameweekRosters.1.captainId still on current team`,
        });
        continue;
      }

      skipped.push({
        userId: userId.toString(),
        userName,
        reason:
          'no Ed-style pickHistory match AND no usable gameweekRosters[1].captainId — manual review required',
      });
    }

    // 4. Print summary
    console.log(`Candidates: ${candidates.length}`);
    console.log(`  Restorable: ${decisions.length}`);
    console.log(`  Skipped: ${skipped.length}\n`);

    for (const d of decisions) {
      const capName = golferNames.get(d.restoredCaptainId.toString()) || d.restoredCaptainId.toString();
      console.log(
        `  ✅ ${d.userName}\n     strategy: ${d.strategy}\n     captain → ${capName}\n     evidence: ${d.evidence}`
      );
    }
    for (const s of skipped) {
      console.log(`  ⚠️  ${s.userName}: ${s.reason}`);
    }
    console.log('');

    if (!isExecute) {
      console.log('🟡 DRY RUN — no changes written. Re-run with --execute to apply.');
      await client.close();
      return;
    }

    // 5. Apply
    let applied = 0;
    let conflicted = 0;
    for (const d of decisions) {
      const pick = candidates.find((p) => p.userId.toString() === d.userId.toString())!;
      const now = new Date();
      const gwKey = String(currentGW);

      // Optimistic lock on updatedAt
      const filter: Record<string, unknown> = {
        _id: pick._id,
        captainId: null,
      };
      if (pick.updatedAt) filter.updatedAt = pick.updatedAt;

      const existingRoster = pick.gameweekRosters?.[gwKey];
      const rosterEntry: GameweekRoster = {
        golferIds: existingRoster?.golferIds ?? pick.golferIds,
        captainId: d.restoredCaptainId,
      };

      const result = await db.collection<PickDoc>('picks').updateOne(filter, {
        $set: {
          captainId: d.restoredCaptainId,
          [`gameweekRosters.${gwKey}`]: rosterEntry,
          updatedAt: now,
        },
      });

      if (result.modifiedCount === 1) {
        applied++;
        // Audit entry
        await db.collection('pickHistory').insertOne({
          userId: pick.userId,
          season: seasonNum,
          reason: 'Admin correction: restored captain (no-captain bug fix)',
          changedAt: now,
          golferIds: pick.golferIds,
          captainId: d.restoredCaptainId,
          totalSpent: pick.totalSpent ?? 0,
          metadata: { strategy: d.strategy, evidence: d.evidence },
        });
        console.log(`  ✓ applied: ${d.userName}`);
      } else {
        conflicted++;
        console.log(`  ✗ conflict: ${d.userName} — concurrent write, skipped`);
      }
    }

    console.log(`\n🟢 Applied: ${applied}, Conflicts: ${conflicted}, Skipped: ${skipped.length}`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
