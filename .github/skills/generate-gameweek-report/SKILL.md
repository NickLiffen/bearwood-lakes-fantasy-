---
name: generate-gameweek-report
description: Generate a weekly Bearwood Lakes Fantasy Golf stats report for the most recently completed gameweek. Use when asked to produce the gameweek report, weekly stats, or league update. This skill queries the production MongoDB database to compile leaderboard standings, top performers, team of the week, tournament results, and transfer activity into a formatted GitHub issue.
---

# Generate Gameweek Report

This skill produces the weekly stats report for Bearwood Lakes Fantasy Golf. It queries the **production MongoDB database** directly via `npx tsx` scripts to gather all the data, then creates a formatted GitHub issue summarising the completed gameweek.

## When to Use

- Every week after the gameweek ends (Saturday → Friday cycle, with the new gameweek starting Saturday at 8am UK time)
- When explicitly asked to "generate the gameweek report" or "produce the weekly stats"
- As part of an automated workflow triggered by a GitHub Actions schedule

## Prerequisites

The following environment variables **must** be available in the runtime:

- `MONGODB_URI` — Connection string for the production MongoDB cluster
- `MONGODB_DB_NAME` — Database name (e.g. `bearwood-fantasy`)
- `REDIS_URL` — (optional) Redis connection for cache invalidation

These are stored as GitHub Actions secrets and injected at workflow runtime.

**GitHub Actions workflow requirements (if running via scheduled automation):**
- `permissions: issues: write, contents: read`
- `GH_TOKEN: ${{ github.token }}` or a PAT with issue-write scope
- `TZ: Europe/London` — set in the job `env` to ensure correct UK time calculations

## Step-by-Step Process

### 1. Determine the Last Completed Gameweek

The season uses a Saturday-to-Friday gameweek cycle. The active season may have a custom `firstGameweekStart` date (which can be a non-Saturday like a Friday). After GW1, all subsequent gameweeks follow the normal Saturday cadence.

**Key logic (from `netlify/functions/_shared/utils/dates.ts`):**
- `getWeekStart(date, firstGameweekStart)` — returns the Saturday (or GW1 custom start) for a date
- `getWeekEnd(weekStart, firstGameweekStart)` — returns the end of the gameweek (Friday 23:59:59)
- `getGameweekNumber(weekStart, seasonStartDate, firstGameweekStart)` — calculates GW number
- A gameweek is "completed" when `weekEnd < now`

**IMPORTANT: Use the date utility functions to find the last completed gameweek.** Do NOT manually subtract 7 days — this breaks for custom GW1 start dates. Instead:

```typescript
import { getWeekStart, getWeekEnd, getGameweekNumber } from './netlify/functions/_shared/utils/dates';

const now = new Date();
const firstGW = season.firstGameweekStart ? new Date(season.firstGameweekStart) : null;
const seasonStartDate = new Date(season.startDate);

// Find current week start, then go to 1ms before it to land in the previous week
const currentWeekStart = getWeekStart(now, firstGW);
const previousReferenceDate = new Date(currentWeekStart.getTime() - 1);
const completedWeekStart = getWeekStart(previousReferenceDate, firstGW);
const completedWeekEnd = getWeekEnd(completedWeekStart, firstGW);
const gameweekNumber = getGameweekNumber(completedWeekStart, seasonStartDate, firstGW);

// Verify the week is actually completed
if (completedWeekEnd >= now) {
  console.log('No completed gameweek to report on');
  process.exit(0);
}
```

### 2. Write a Temporary Script to Gather Data

Create a temporary TypeScript script at `scripts/.generate-gameweek-report.ts` (dot-prefixed to signal it's temporary) that connects to the production MongoDB database and gathers all report data. **Delete the script after use — do not commit it.**

The script should:
- Use the same database connection pattern as existing scripts (see `scripts/backup.ts` for reference)
- **Reuse the existing scoring utilities** from the codebase rather than reimplementing scoring logic
- Always close the MongoDB client in a `finally` block

```typescript
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB_NAME!;
const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  // ... gather data ...
} finally {
  await client.close();
}
```

**Critical: Reuse existing scoring utilities.** The script should import and use functions from the codebase to ensure scoring matches the app exactly:

```typescript
// Leaderboard calculation — single source of truth
import { calculateLeaderboard, rankEntries } from '../netlify/functions/_shared/utils/leaderboard-calculator';

// Roster lookup — handles missing snapshots by finding latest roster at or before target GW
import { getRosterForGameweek } from '../netlify/functions/_shared/utils/scoring';

// Date utilities — handles custom GW1 starts correctly
import { getWeekStart, getWeekEnd, getGameweekNumber, getFirstGameweekStart } from '../netlify/functions/_shared/utils/dates';
```

### 3. Data to Collect

Gather **all** of the following for the completed gameweek:

#### A. Season & Gameweek Context
- Active season details from the `seasons` collection (`isActive: true`)
- The completed gameweek number, start date, and end date
- Total number of gameweeks played so far this season

#### B. Weekly Leaderboard (Gameweek Standings)

**Use `calculateLeaderboard()` and `rankEntries()` from `netlify/functions/_shared/utils/leaderboard-calculator.ts`** — this is the single source of truth for scoring. Do NOT reimplement the scoring loop.

1. Fetch the raw data from MongoDB:
   - All `picks` for the current season (fields: `userId`, `golferIds`, `captainId`, `gameweekRosters`, `allGolferIds`, `totalSpent`, `createdAt`)
   - All `users` (fields: `_id`, `firstName`, `lastName`, `username`)
   - All published/complete `tournaments` for the season
   - All `scores` for those tournaments
2. Build a `userMap: Map<string, UserDocument>` from the users
3. Call `calculateLeaderboard(picks, userMap, tournaments, scores, weekStart, weekEnd, firstGW, undefined, seasonStartDate)` for the completed week
4. Call `calculateLeaderboard(...)` again for the **previous week** to get old rankings
5. Call `rankEntries(currentEntries, previousEntries)` to get rankings with movement (↑ ↓ →)

#### C. Season Leaderboard (Overall Standings)
Call `calculateLeaderboard(...)` with `seasonStartDate` → `seasonEndDate` as the period boundaries. Then `rankEntries(seasonEntries, null)`.

#### D. Monthly Leaderboard
Call `calculateLeaderboard(...)` with month boundaries — but **use `completedWeekEnd` as the reference date** for determining which month, not `new Date()`. This prevents reporting the wrong month when the report runs on a Saturday in a new month but the gameweek ended Friday in the previous month.

```typescript
import { getMonthStart, getMonthEnd } from '../netlify/functions/_shared/utils/dates';
const monthStart = getMonthStart(completedWeekEnd);
const monthEnd = getMonthEnd(completedWeekEnd);
```

#### E. Team of the Week (Dream Team)
The top 6 highest-scoring **golfers** across all tournaments in the completed gameweek:

1. Aggregate scores per golfer: `db.collection('scores').aggregate([{ $match: { tournamentId: { $in: weekTournamentIds }, participated: true }}, { $group: { _id: '$golferId', totalPoints: { $sum: '$multipliedPoints' }}}, { $sort: { totalPoints: -1 }}, { $limit: 6 }])`
2. Fetch golfer details (`firstName`, `lastName`, `price`) from `golfers` collection
3. The highest scorer is the "dream captain" — their points are doubled in the dream team total

#### F. Tournament Results
For each tournament in the completed gameweek:
- Tournament name, type (from `TOURNAMENT_TYPE_CONFIG`), multiplier, scoring format
- Number of golfers who participated
- Top 3 finishers with their names, positions, raw scores, and multiplied points
- Tournament type labels: `rollup_stableford` → "Rollup Stableford", `weekday_medal` → "Weekday Medal", `weekend_medal` → "Weekend Medal (2×)", `presidents_cup` → "Presidents Cup (3×)", `founders` → "Founders (4×)", `club_champs_nett` → "Club Champs Nett (5×)"

#### G. Transfer Activity

Query the `pickHistory` collection for transfers during the gameweek period. **Important nuances:**

- **Filter out non-transfer entries** — exclude records with these `reason` values: `Initial pick`, `Captain change`, `Scheduled captain change`. Only include entries with `reason` containing `transfer` (e.g., `Scheduled transfer`, `Manual transfer`).
- **Compute in/out golfer diffs** — `pickHistory` stores the resulting roster, not explicit transfer pairs. To determine which golfers were transferred in/out:
  1. For each user with a transfer history entry in this gameweek, find the entry just before it (the previous state)
  2. `out = previousGolferIds - currentGolferIds`
  3. `in = currentGolferIds - previousGolferIds`
- Resolve golfer IDs to names from the `golfers` collection
- Count users who made no transfers this week

#### H. Captain Choices

Use `getRosterForGameweek()` from `netlify/functions/_shared/utils/scoring.ts` to look up each user's captain for the completed gameweek. **Do NOT use direct `gameweekRosters[gwNumber]` lookup** — `getRosterForGameweek()` correctly handles the case where a user has no snapshot for the exact gameweek by returning the latest snapshot at or before the target gameweek.

```typescript
import { getRosterForGameweek, type RosterSnapshot } from '../netlify/functions/_shared/utils/scoring';

// Convert pick.gameweekRosters to string-keyed format
const rosters: Record<string, RosterSnapshot> = {};
for (const [gw, r] of Object.entries(pick.gameweekRosters || {})) {
  rosters[gw] = {
    golferIds: r.golferIds.map(id => id.toString()),
    captainId: r.captainId?.toString() || null,
  };
}

const roster = getRosterForGameweek(rosters, gameweekNumber);
const captainId = roster?.captainId;
```

For each user's captain:
- Calculate how many points the captain earned this week (sum of `multipliedPoints` for that golfer × 2)
- Determine the best captain pick (highest doubled points) and worst captain pick (lowest doubled points)

If `gameweekRosters` doesn't exist for a user (legacy data), fall back to `pick.captainId`.

#### I. Golfer Performance Summary
- **Highest individual scorer:** Golfer who earned the most `multipliedPoints` across all tournaments in the week
- **Most-owned golfer:** Appears on the most teams' rosters for this gameweek (use `getRosterForGameweek()` for each pick)
- **Best value golfer:** Highest points-per-million based on `price` from `golfers` collection. Display prices in millions: `golfer.price / 1_000_000` (prices are stored in whole units, e.g. `8_000_000` = £8M)

### 4. Check for Duplicate Reports (Idempotency)

Before creating a new issue, check if a report for this gameweek already exists:

```bash
existing=$(gh issue list --repo NickLiffen/bearwood-lakes-fantasy- --label gameweek-report --search "Gameweek {N} Report" --state all --json number --jq '.[0].number // empty')
if [ -n "$existing" ]; then
  echo "Gameweek {N} report already exists as issue #${existing} — skipping"
  exit 0
fi
```

This prevents duplicate reports from workflow retries or manual re-runs.

### 5. Format the Report

Structure the report as a **GitHub issue** with this format:

```markdown
# 🏌️ Gameweek {N} Report — {startDate} to {endDate}

> Season {year} | {tournamentCount} tournament(s) this week

---

## 🏆 Weekly Standings (Gameweek {N})

| Rank | Movement | Player | Points | Events |
|------|----------|--------|--------|--------|
| 1 | 🆕/⬆️ 2/⬇️ 1/➡️ | Name | 45 | 3 |

---

## 📊 Season Standings (after GW{N})

| Rank | Player | Total Points | Team Value |
|------|--------|-------------|------------|
| 1 | Name | 156 | £48.5M |

---

## ⭐ Team of the Week

The dream team for Gameweek {N} — the 6 highest-scoring golfers:

| # | Golfer | Points | Captain Bonus |
|---|--------|--------|---------------|
| 🧢 | Name (C) | 24 (×2 = 48) | Dream Captain |
| 2 | Name | 18 | |

**Dream Team Total: {totalPoints} pts**

---

## 🏌️ Tournament Results

### {Tournament Name} ({Type}, {multiplier}×)
{participantCount} golfers | {scoringFormat}

| Pos | Golfer | Score | Base | Bonus | Total (×{mult}) |
|-----|--------|-------|------|-------|------------------|
| 1st | Name | 38 | 10 | 3 | 26 |

---

## 🔄 Transfer Activity

- **{totalTransfers}** transfers made this gameweek
- **{usersWithNoTransfer}** players held firm with no changes

| Player | Out | In |
|--------|-----|-----|
| Name | Golfer A | Golfer B |

---

## 🧢 Captain Watch

- **Best captain pick:** {name} captained {golferName} — earned {points} × 2 = {doubled} pts
- **Worst captain pick:** {name} captained {golferName} — earned {points} × 2 = {doubled} pts

---

## 📈 Golfer Spotlight

- **🔥 Top scorer:** {golferName} — {points} pts across {events} events
- **👥 Most owned:** {golferName} — on {count}/{total} teams ({percentage}%)
- **💰 Best value:** {golferName} — {points} pts at £{price}M ({ptsPerMillion} pts/£M)

---

*Report generated automatically for Bearwood Lakes Fantasy Golf*
```

### 6. Create the GitHub Issue

Use the GitHub CLI to create the issue:

```bash
gh label create "gameweek-report" --repo NickLiffen/bearwood-lakes-fantasy- --description "Weekly gameweek stats report" --color "1D76DB" 2>/dev/null || true

gh issue create \
  --repo NickLiffen/bearwood-lakes-fantasy- \
  --title "🏌️ Gameweek {N} Report — {startDate} to {endDate}" \
  --body-file report.md \
  --label "gameweek-report"
```

### 7. Cleanup

- Delete the temporary report script (`scripts/.generate-gameweek-report.ts`)
- Delete any temporary output files (e.g., `report.md`)
- Verify the working tree is clean: `git status --short` should show no changes
- Do **not** commit any temporary files to the repository

## Important Implementation Notes

### Scoring Rules (from `shared/types/tournament.types.ts`)

**Position points:** 1st = 10, 2nd = 7, 3rd = 5, all others = 0

**Bonus points (Stableford, single day):** Score ≥ 36 → +3, Score ≥ 32 → +1
**Bonus points (Stableford, multi-day):** Score ≥ 72 → +3, Score ≥ 64 → +1
**Bonus points (Medal, single day):** Score ≤ 0 → +3, Score ≤ 4 → +1
**Bonus points (Medal, multi-day):** Score ≤ 0 → +3, Score ≤ 8 → +1

**Multiplied points:** `(basePoints + bonusPoints) × tournamentMultiplier`
**Captain bonus:** Captain's `multipliedPoints × 2` (applied at the team level, not stored in scores)

### Gameweek Roster Lookup — CRITICAL

**Always use `getRosterForGameweek()` from `netlify/functions/_shared/utils/scoring.ts`** instead of directly accessing `gameweekRosters[gwNumber]`. The function returns the highest roster snapshot key `<=` the target gameweek, which correctly handles cases where a user made no transfer in a later gameweek (and thus has no snapshot for that exact week number).

```typescript
import { getRosterForGameweek, type RosterSnapshot } from '../netlify/functions/_shared/utils/scoring';

// Convert gameweekRosters from MongoDB ObjectIds to string-keyed format
const rosters: Record<string, RosterSnapshot> = {};
for (const [gw, r] of Object.entries(pick.gameweekRosters || {})) {
  rosters[gw] = {
    golferIds: r.golferIds.map(id => id.toString()),
    captainId: r.captainId?.toString() || null,
  };
}

const roster = getRosterForGameweek(rosters, gameweekNumber);
// roster.golferIds — the 6 golfers active that week
// roster.captainId — who was captain that week
```

If `gameweekRosters` doesn't exist at all for a user (legacy data), fall back to `pick.golferIds` and `pick.captainId`.

### Price Display

Golfer prices are stored in whole units (e.g., `8_000_000` = £8M). Display in millions:

```typescript
const priceDisplay = `£${(golfer.price / 1_000_000).toFixed(1)}M`;
// e.g., 8_500_000 → "£8.5M"
```

Team value / total spent follows the same pattern. Budget cap is £50M (`50_000_000`).

### Date Handling

- All dates use JavaScript `Date` objects with `setHours(0, 0, 0, 0)` for midnight
- The transfer deadline is Saturday 8am UK time (BST/GMT aware via `Europe/London` timezone)
- GW1 may start on a non-Saturday (check `season.firstGameweekStart`)
- GW2 onwards always starts on Saturday
- **Always use the date utilities** (`getWeekStart`, `getWeekEnd`, etc.) rather than manual date arithmetic

### MongoDB Collections Reference

| Collection | Key Fields |
|-----------|------------|
| `seasons` | `name`, `startDate`, `endDate`, `firstGameweekStart`, `isActive` |
| `users` | `firstName`, `lastName`, `username`, `role` |
| `picks` | `userId`, `golferIds`, `captainId`, `gameweekRosters`, `allGolferIds`, `totalSpent`, `season`, `createdAt` |
| `pickHistory` | `userId`, `golferIds`, `captainId`, `totalSpent`, `season`, `changedAt`, `reason` |
| `tournaments` | `name`, `startDate`, `endDate`, `tournamentType`, `scoringFormat`, `isMultiDay`, `multiplier`, `season`, `status` |
| `scores` | `golferId`, `tournamentId`, `participated`, `position`, `rawScore`, `basePoints`, `bonusPoints`, `multipliedPoints` |
| `golfers` | `firstName`, `lastName`, `price`, `isActive` |

### Game Constants (from `shared/constants/rules.ts`)

- Budget cap: £50M (`50_000_000` stored value)
- Team size: exactly 6 golfers
- 1 free transfer per week (during active season)
- Captain earns 2× points

## Error Handling

- If no tournaments occurred in the completed gameweek, still generate a report noting "No tournaments this gameweek" — include leaderboard standings and transfer activity as those are still relevant
- If the season hasn't started yet, report that and exit gracefully
- If database connection fails, exit with a clear error message
- Always ensure the MongoDB client is closed in a `finally` block
- If `gh issue create` fails, output the report to stdout so it can still be reviewed
