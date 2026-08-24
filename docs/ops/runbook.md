# Operations runbook

> Incident response, rollback, secret rotation, and data recovery for the hosted
> Lumo backend (Render + Turso). Covers the runbook / status-page items in
> `docs/business/commercialization-readiness.md` §4 (#473) and the key-rotation item in
> §6 (#474). Monitoring/alerting setup is in
> [`reliability-monitoring.md`](./reliability-monitoring.md); backup/restore in
> [`database-backup.md`](./database-backup.md).

## Topology (what runs where)

- **Backend** — Render web service, `node dist/bundle.cjs`, health-checked at
  `/health`. Build/boot contract is enforced in CI by `render-deploy-check`.
- **Database** — Turso (libSQL) via `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`.
- **Frontend** — Render static site.
- **Email** — Resend (when `LUMO_EMAIL_PROVIDER=resend`), else dev outbox.

## Deploy & rollback

- **Deploy:** merge to `main` → CI (`ci` aggregate gate must be green) → Render
  auto-deploys. `render-deploy-check` reproduces the prod build + boot so a
  non-booting bundle is caught in CI, not on Render.
- **Rollback (fastest):** Render dashboard → the service → **Deploys** → pick the
  last known-good deploy → **Rollback**. This re-runs the previous image without
  waiting on a build.
- **Rollback (git):** `git revert <bad-sha> && git push` → let CI + auto-deploy
  roll forward to the reverted state. Prefer this when the bad change must also
  leave `main` history clean.
- **Never** hand-edit files on the instance; the filesystem is ephemeral and a
  redeploy wipes it.

## Incident response (quick flow)

1. **Confirm scope** — hit `/health` (process up?) and `/ready` (DB up? 503 = DB
   down). Check Render logs; grep the structured JSON logs by `requestId` /
   `error`.
2. **Classify** — process down, DB down (Turso), bad deploy, or dependency
   (email/OAuth/AI upstream).
3. **Mitigate** — bad deploy → **rollback** (above). DB down → check Turso
   status; readiness will 503 and shed load until it recovers.
4. **Communicate** — post to the status page + notify affected users if
   customer-visible (see below).
5. **Follow up** — capture the `requestId`/timeline; once Sentry is live
   (§ reliability-monitoring §1) link the event; write a short post-incident note.

## Secret & key rotation

All secrets live in Render env (backend service). **Blast radius differs per
secret — read before rotating.**

| Secret | Purpose | Rotation | Blast radius |
|--------|---------|----------|--------------|
| `LUMO_JWT_SECRET` | Signs access/refresh tokens | Set a new strong value (≥ policy min); redeploy | **All sessions invalidated** — every user must re-authenticate. Refresh tokens fail closed. |
| `LUMO_ENCRYPTION_KEY` | AES-256-GCM key for `enc:v1:` blobs (per-user AI keys + cloud sync tokens) | ⚠️ **Do NOT rotate naively.** | **Rotating breaks decryption of every existing `enc:v1` blob** — users' stored AI keys / sync tokens become unreadable. Requires a re-encryption migration (decrypt-with-old → encrypt-with-new) before cutover, or users must re-enter keys. Plan it; never just change the value. |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | DB connection | Rotate the token in Turso, update both the backend env and the backup secrets | Brief connection blips on redeploy; no data change. |
| `LUMO_RESEND_API_KEY` | Transactional email | Rotate in Resend, update env | Email delivery only (verification / password reset / receipts). |
| `LUMO_GITHUB_CLIENT_SECRET` | GitHub OAuth login | Rotate in the GitHub OAuth app, update env | GitHub sign-in only; password login unaffected. |
| `SENTRY_DSN` (when added) | Error reporting | Rotate in Sentry, update env | Telemetry only; no user impact. |

Notes:
- **AI provider keys are user-supplied**, stored per-user encrypted with
  `LUMO_ENCRYPTION_KEY` — they are never a global secret and never returned by the
  API (only `hasKey: boolean`).
- After any rotation, redeploy and confirm boot: `secret-policy` fails fast on a
  blank/placeholder/too-short secret, so a bad value shows up immediately at boot,
  not as a silent runtime error.

## Data recovery

- **Backups:** logical `.sql` dumps via the scheduled workflow (opt-in) — see
  [`database-backup.md`](./database-backup.md).
- **Restore:** create schema on a fresh DB (`npm run migrate`), replay the dump.
  A partial/corrupt dump fails atomically (wrapped in one transaction).
- **Drill:** actually run a restore into a throwaway DB before you need it — an
  untested backup is not a backup (tracked in #471).

## Incident communication / status page

- **Status page:** a built-in, dependency-free page is served at
  **`<api-origin>/status`** (e.g. `https://api.lumo.app/status`). It polls
  `/health` (liveness) + `/ready` (DB readiness) from the same origin and shows a
  plain "is it up?" answer — no external account (BetterStack / Instatus)
  required. Link users here for one canonical status. Caveat: it is served *by*
  the backend, so it reports a **degraded DB while the process is up**, but a full
  process outage takes the page down with it — external down-detection is the
  uptime-monitor item tracked in #471. Add a hosted monitor there when you want
  independent outage alerting.
- **Comms template (fill in):**
  > **[Investigating] <service> degraded** — <time UTC>. We're seeing <symptom>.
  > Impact: <who / what>. Next update in <N> min.
  > … **[Identified]** cause is <x>, mitigation in progress.
  > … **[Resolved]** <time UTC>. Root cause + follow-ups to come.
- Keep updates factual and on a promised cadence; resolve with a brief root-cause
  note.
