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
