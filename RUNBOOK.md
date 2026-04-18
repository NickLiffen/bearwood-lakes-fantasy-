# Emergency Recovery Runbook

Quick-reference commands and step-by-step recovery for Bearwood Lakes Fantasy Golf.

---

## Quick Reference

| Action                 | Command                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| **Backup database**    | `npm run db:backup`                                               |
| **Restore database**   | `npm run db:restore scripts/backups/<dir>`                        |
| **Lock transfers**     | Admin Panel → Settings → Lock transfers                           |
| **Rollback deploy**    | Netlify Dashboard → Deploys → click old deploy → "Publish deploy" |
| **View function logs** | Netlify Dashboard → Functions → select function                   |
| **Health check**       | `curl https://your-site.netlify.app/api/health`                   |

---

## 🔴 SITE IS DOWN (frontend not loading)

1. Check Netlify status: https://www.netlifystatus.com/
2. Check your deploy: Netlify Dashboard → Deploys → look for failed build
3. If bad deploy: Click last working deploy → **"Publish deploy"** (instant rollback)
4. If Netlify outage: Wait — CDN will recover. Nothing you can do.

## 🔴 API ERRORS (500s, data not loading)

1. Check `/api/health` — is DB connected?
2. Check Netlify Functions log: Dashboard → Functions → select function → view logs
3. If `MONGODB_URI` wrong: Dashboard → Environment variables → fix → trigger redeploy
4. If MongoDB Atlas down: Check https://status.cloud.mongodb.com/
5. If data corrupted: Follow **Data Loss** procedure below

## 🔴 DATA LOSS / CORRUPTION

1. **IMMEDIATELY**: Lock transfers
   - Admin Panel → Settings → Lock transfers = OFF
   - Or: `POST /api/admin-lock-transfers` with body `{ "transfersOpen": false }`
2. Backup the current (possibly corrupted) state:
   ```bash
   npm run db:backup
   ```
3. Identify the last good backup in `scripts/backups/`
4. Restore:
   ```bash
   npm run db:restore scripts/backups/<good-backup-dir>
   ```
5. Verify:
   - Check `/api/health` returns `status: ok`
   - Check admin panel — golfer count, tournament count
   - Spot-check a few records
6. Unlock transfers when confirmed good

## 🟡 AUTH BROKEN (users can't log in)

1. Check `JWT_SECRET` in Netlify env vars — has it changed?
2. If rotated accidentally: All tokens are invalid. Users must re-login. This is expected.
3. If refresh endpoint failing: Check Redis connection (`REDIS_URL`)
4. Nuclear option: Clear `refreshTokens` collection — all users must re-login
   ```bash
   # Only if necessary — forces all users to login again
   ```

## 🟡 RATE LIMITING / REDIS DOWN

1. App will continue working (fail-open design) — just unprotected from abuse
2. Check `REDIS_URL` env var in Netlify Dashboard
3. Check your Redis provider's status page
4. Settings cache will rebuild automatically on next request

## 🟢 PHONE VERIFICATION BROKEN

1. Check Twilio status: https://status.twilio.com/
2. Check `TWILIO_*` env vars in Netlify Dashboard
3. Existing users are unaffected (already verified)
4. Only blocks new user registration until resolved

---

## Environment Variables Checklist

| Variable      | What breaks if wrong                                             |
| ------------- | ---------------------------------------------------------------- |
| `MONGODB_URI` | **All API calls fail** — entire app is dead                      |
| `JWT_SECRET`  | All existing tokens invalidate — every user logged out           |
| `REDIS_URL`   | Rate limiting + settings cache break (app works but unprotected) |
| `TWILIO_*`    | Phone verification fails — new registrations blocked             |

---

## Backup Schedule

- **Before any admin action** (score entry, price changes): `npm run db:backup`
- **Automated**: Daily at 6 AM UTC via GitHub Actions
- **Retention**: 30 days (GitHub Actions artifacts)

---

## Captain Data Incidents

Signs of the "no-captain" bug class: users showing no captain (0 × multiplier)
in the leaderboard, `picks.captainId: null` for an active-season user, or a
user reporting that their captain selection "disappeared".

### Root causes (fixed, see PR history)

1. **Frontend toggle bug** — clicking the C button on the already-active
   captain in `TeamGolferTable` / `MyTeamPage` used to set `captainId: null`.
   A double-tap was enough to wipe the selection.
2. **Backend null/undefined asymmetry** — `applyPendingChanges` only auto-
   assigned a new captain when `pendingCaptainId` was `undefined`. Explicit
   `null` bypassed the safety net.
3. **TeamBuilder conflation** — when the captain was transferred out, the
   save payload sent `captainId: null` instead of omitting the field.

Post-fix, the apply path always leaves a non-null `captainId` when
`golferIds` is non-empty (final safety check in `picks.service.ts`).

### Detection queries

```js
// mongosh — users with no captain in the active season
use bearwood-fantasy;
db.seasons.findOne({ isActive: true });
// substitute season number from `name` above
db.picks.find({ season: 2026, captainId: null }).toArray();

// Any picks that ever received an explicit null pendingCaptainId
db.picks.find({ season: 2026, pendingCaptainId: null }).toArray();
```

### Remediation

Use `scripts/fix-no-captain-users.ts`. The script picks a captain per user
in this priority order:

1. **Ed-style** — if `pickHistory` shows a non-null captain set then wiped
   to null within 60 seconds, and the chosen golfer is still on the team,
   restore to that golfer.
2. **GW1 roster** — else, use `gameweekRosters[1].captainId` if it is still
   on the current team.
3. **Skip** — otherwise, log for manual review.

```bash
# Dry run (default — shows proposed changes, writes nothing)
npx tsx scripts/fix-no-captain-users.ts

# Target specific users only
npx tsx scripts/fix-no-captain-users.ts --users=<userId1>,<userId2>

# Execute (writes picks.captainId, gameweekRosters[currentGw], pickHistory)
npx tsx scripts/fix-no-captain-users.ts --execute
```

The script uses an optimistic lock on `updatedAt` and writes a
`pickHistory` audit entry with
`reason: 'Admin correction: restored captain (no-captain bug fix)'`.

After running, verify:

```js
db.picks.countDocuments({ season: <N>, captainId: null }); // expect 0
```
