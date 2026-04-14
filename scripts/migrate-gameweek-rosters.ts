// Migration script: Populate gameweekRosters and allGolferIds on picks
// Reconstructs per-gameweek roster history from pickHistory collection.
//
// Usage:
//   npx tsx scripts/migrate-gameweek-rosters.ts           # Dry run (preview changes)
//   npx tsx scripts/migrate-gameweek-rosters.ts --apply    # Apply changes

import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';
const isDryRun = !process.argv.includes('--apply');

interface PickDoc {
  _id: ObjectId;
  userId: ObjectId;
  golferIds: ObjectId[];
  captainId?: ObjectId | null;
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

// --- Date helpers (mirrored from the app) ---

function getSeasonFirstSaturday(seasonStartDate: Date): Date {
  const d = new Date(seasonStartDate);
  while (d.getDay() !== 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function getFirstGameweekStart(
  seasonStartDate: Date,
  firstGameweekStart?: Date | null
): Date {
  if (firstGameweekStart) {
    const d = new Date(firstGameweekStart);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return getSeasonFirstSaturday(seasonStartDate);
}

function getWeekStart(date: Date, firstGameweekStart?: Date | null): Date {
  if (firstGameweekStart) {
    const gw1Start = new Date(firstGameweekStart);
    gw1Start.setHours(0, 0, 0, 0);

    const firstSat = getSeasonFirstSaturday(firstGameweekStart);
    const gw2Start = new Date(firstSat);
    gw2Start.setDate(gw2Start.getDate() + 7);
    gw2Start.setHours(0, 0, 0, 0);

    if (date >= gw1Start && date < gw2Start) {
      return gw1Start;
    }
  }

  const d = new Date(date);
  const dayOfWeek = d.getDay();
  let daysSinceSaturday: number;
  if (dayOfWeek === 6) {
    daysSinceSaturday = 0;
  } else {
    daysSinceSaturday = dayOfWeek + 1;
  }
  d.setDate(d.getDate() - daysSinceSaturday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getGameweekNumber(
  weekStart: Date,
  seasonStartDate: Date,
  firstGameweekStart?: Date | null
): number {
  const anchor = getFirstGameweekStart(seasonStartDate, firstGameweekStart);
  const diffMs = weekStart.getTime() - anchor.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

function getNextWeekStart(date: Date, firstGameweekStart?: Date | null): Date {
  const currentWeekStart = getWeekStart(date, firstGameweekStart);

  if (firstGameweekStart) {
    const gw1Start = new Date(firstGameweekStart);
    gw1Start.setHours(0, 0, 0, 0);

    const isSameDay =
      currentWeekStart.getFullYear() === gw1Start.getFullYear() &&
      currentWeekStart.getMonth() === gw1Start.getMonth() &&
      currentWeekStart.getDate() === gw1Start.getDate();

    if (isSameDay) {
      const firstSat = getSeasonFirstSaturday(firstGameweekStart);
      const gw2Start = new Date(firstSat);
      gw2Start.setDate(gw2Start.getDate() + 7);
      gw2Start.setHours(8, 0, 0, 0);
      return gw2Start;
    }
  }

  const nextWeek = new Date(currentWeekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(8, 0, 0, 0);
  return nextWeek;
}

// --- Main migration ---

async function migrate() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set. Please set it as an environment variable.');
    process.exit(1);
  }

  console.log(`\n🔄 Gameweek Rosters Migration ${isDryRun ? '(DRY RUN)' : '(APPLYING CHANGES)'}\n`);

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  try {
    // Get the active season
    const season = await db.collection<SeasonDoc>('seasons').findOne({ isActive: true });
    if (!season) {
      console.error('❌ No active season found.');
      process.exit(1);
    }

    const seasonNum = parseInt(season.name, 10) || new Date().getFullYear();
    const seasonStartDate = new Date(season.startDate);
    const firstGW = season.firstGameweekStart ? new Date(season.firstGameweekStart) : null;
    const firstGameweekAnchor = getFirstGameweekStart(seasonStartDate, firstGW);

    console.log(`📅 Season: ${season.name}`);
    console.log(`📅 Season start: ${seasonStartDate.toISOString()}`);
    console.log(`📅 First gameweek start: ${firstGameweekAnchor.toISOString()}`);
    console.log('');

    // Get all picks for this season
    const picks = await db
      .collection<PickDoc>('picks')
      .find({ season: seasonNum })
      .toArray();

    console.log(`👥 Found ${picks.length} picks to process\n`);

    // Get all golfer names for display
    const allGolferIdsSet = new Set<string>();
    for (const pick of picks) {
      for (const id of pick.golferIds) allGolferIdsSet.add(id.toString());
    }

    const golferDocs = await db
      .collection('golfers')
      .find({ _id: { $in: Array.from(allGolferIdsSet).map((id) => new ObjectId(id)) } })
      .project({ firstName: 1, lastName: 1 })
      .toArray();

    const golferNames = new Map(
      golferDocs.map((g) => [g._id.toString(), `${g.firstName} ${g.lastName}`])
    );

    // Get all user names for display
    const userIds = picks.map((p) => p.userId);
    const userDocs = await db
      .collection('users')
      .find({ _id: { $in: userIds } })
      .project({ firstName: 1, lastName: 1, username: 1 })
      .toArray();

    const userNames = new Map(
      userDocs.map((u) => [u._id.toString(), `${u.firstName} ${u.lastName} (@${u.username})`])
    );

    let updated = 0;
    let skipped = 0;

    for (const pick of picks) {
      const userId = pick.userId.toString();
      const userName = userNames.get(userId) || userId;

      // Skip if already has gameweekRosters
      if (pick.gameweekRosters && Object.keys(pick.gameweekRosters).length > 0) {
        console.log(`⏭️  ${userName}: Already has gameweekRosters, skipping`);
        skipped++;
        continue;
      }

      // Get pick history for this user, sorted chronologically
      const history = await db
        .collection<PickHistoryDoc>('pickHistory')
        .find({ userId: pick.userId, season: seasonNum })
        .sort({ changedAt: 1 })
        .toArray();

      if (history.length === 0) {
        console.log(`⚠️  ${userName}: No pick history found, creating roster from current team`);
        // Create GW1 roster from current team
        const gameweekRosters: Record<string, { golferIds: ObjectId[]; captainId: ObjectId | null }> = {
          '1': {
            golferIds: pick.golferIds,
            captainId: pick.captainId || null,
          },
        };

        if (!isDryRun) {
          await db.collection<PickDoc>('picks').updateOne(
            { _id: pick._id },
            {
              $set: {
                gameweekRosters,
                allGolferIds: pick.golferIds,
              },
            }
          );
        }

        console.log(`  ✅ Set GW1 roster: [${pick.golferIds.map((id) => golferNames.get(id.toString()) || id).join(', ')}]`);
        updated++;
        continue;
      }

      // Reconstruct gameweek rosters from history
      const gameweekRosters: Record<string, { golferIds: ObjectId[]; captainId: ObjectId | null }> = {};
      const allHistoricalGolferIds = new Set<string>();

      for (const entry of history) {
        // Add all golfers to the historical set
        for (const id of entry.golferIds) {
          allHistoricalGolferIds.add(id.toString());
        }

        // Determine effective gameweek for this entry
        let effectiveGW: number;

        if (entry.reason === 'Initial pick') {
          // Initial pick → effective from GW1
          effectiveGW = 1;
        } else if (
          entry.reason === 'Scheduled transfer' ||
          entry.reason === 'Scheduled captain change'
        ) {
          // Deferred transfer → effective from next gameweek after submission
          const nextWeek = getNextWeekStart(entry.changedAt, firstGW);
          const weekStart = getWeekStart(nextWeek, firstGW);
          effectiveGW = getGameweekNumber(weekStart, seasonStartDate, firstGW);
        } else {
          // Immediate change (during unlimited transfers) → effective from current GW
          const weekStart = getWeekStart(entry.changedAt, firstGW);
          effectiveGW = getGameweekNumber(weekStart, seasonStartDate, firstGW);
        }

        const gwKey = String(effectiveGW);

        // Determine captain for this entry
        // pickHistory doesn't have captainId for older entries, so we use best-guess logic:
        // 1. If the entry has captainId, use it
        // 2. Otherwise, check if the current captain is in this entry's golferIds
        // 3. If not, default to null (unknown)
        let captainId: ObjectId | null = null;
        if (entry.captainId) {
          captainId = entry.captainId;
        } else if (pick.captainId) {
          const captainInThisTeam = entry.golferIds.some(
            (id) => id.toString() === pick.captainId?.toString()
          );
          if (captainInThisTeam) {
            captainId = pick.captainId;
          }
        }

        gameweekRosters[gwKey] = {
          golferIds: entry.golferIds,
          captainId,
        };

        const golferNamesList = entry.golferIds
          .map((id) => golferNames.get(id.toString()) || id.toString())
          .join(', ');
        const captainName = captainId
          ? golferNames.get(captainId.toString()) || captainId.toString()
          : 'unknown';
        console.log(
          `  📋 ${userName}: GW${gwKey} roster (${entry.reason}): [${golferNamesList}] captain: ${captainName}`
        );
      }

      // Also add current golferIds to allHistoricalGolferIds
      for (const id of pick.golferIds) {
        allHistoricalGolferIds.add(id.toString());
      }

      const allGolferIds = Array.from(allHistoricalGolferIds).map((id) => new ObjectId(id));

      if (!isDryRun) {
        await db.collection<PickDoc>('picks').updateOne(
          { _id: pick._id },
          {
            $set: {
              gameweekRosters,
              allGolferIds,
            },
          }
        );
      }

      console.log(
        `  ✅ ${userName}: Set ${Object.keys(gameweekRosters).length} gameweek roster(s), ${allGolferIds.length} total golfers`
      );
      updated++;
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Total:   ${picks.length}`);

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN — no changes were made. Run with --apply to write changes.');
    } else {
      console.log('\n✅ Migration complete!');
    }
  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
