# Self-hosted VPS deployment

Run Lumo end-to-end on your own VPS with your own domain and TLS. The design is
deliberately small: **one Node process serves both the JSON API (`/v1`, `/docs`)
and the built SPA** on the same origin (no CORS), with a reverse proxy in front
for HTTPS. Everything here lives in [`deploy/vps/`](../../deploy/vps).

Two supported shapes — pick one:

| | Docker + Caddy (recommended) | systemd + nginx |
|---|---|---|
| TLS | automatic (Let's Encrypt, zero config) | certbot (`--nginx`) |
| Isolation | container | host process (hardened unit) |
| Files | `Dockerfile`, `docker-compose.yml`, `Caddyfile` | `lumo-backend.service`, `nginx.conf` |

Both build exactly what production builds — the commands are lifted from the
proven Render blueprint.

---

## 0. Prerequisites

- A VPS (1 vCPU / 1 GB RAM is enough for a small beta) running a recent Linux.
- A domain, with an **A record** (and AAAA if you have IPv6) pointing at the VPS.
- Ports **80 and 443** open (80 is needed for the ACME/Let's Encrypt challenge).
- A **Turso** database (free hosted libsql) — the app's persistence. A local
  file DB inside a container is ephemeral and is wiped on every redeploy, so
  Turso (or another libsql server) is required for a real deployment.

Generate the two secrets you'll need:

```bash
openssl rand -hex 32   # LUMO_JWT_SECRET
openssl rand -hex 32   # LUMO_ENCRYPTION_KEY
```

Create the database:

```bash
turso db create lumo
turso db show --url lumo                 # → TURSO_DATABASE_URL
turso db tokens create lumo              # → TURSO_AUTH_TOKEN
```

> ⚠️ Treat both secrets as permanent. Rotating `LUMO_JWT_SECRET` signs everyone
> out; rotating `LUMO_ENCRYPTION_KEY` makes stored secrets (users' AI keys, sync
> tokens) unreadable.

---

## 1. Configure

```bash
cd deploy/vps
cp .env.example .env
$EDITOR .env            # fill in domain, the two secrets, TURSO_*, LUMO_APP_BASE_URL
```

Minimum to boot: `LUMO_DOMAIN`, `LUMO_JWT_SECRET`, `LUMO_ENCRYPTION_KEY`,
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `LUMO_APP_BASE_URL`. The rest degrade
cleanly when unset (see comments in `.env.example`). Migrations run automatically
on boot — no manual migration step.

---

## 2a. Deploy with Docker + Caddy (recommended)

```bash
cd deploy/vps
docker compose up -d --build
```

Caddy fetches and auto-renews a Let's Encrypt certificate for `LUMO_DOMAIN` and
reverse-proxies to the app. Watch it come up:

```bash
docker compose logs -f app        # app boot + JSON access logs
docker compose logs -f caddy      # certificate issuance
curl -fsS https://$LUMO_DOMAIN/health && echo ok
```

Update to a new version:

```bash
git pull
docker compose up -d --build      # rebuilds the image, recreates the app
```

## 2b. Deploy with systemd + nginx (no Docker)

Build on the host and run under systemd; see the step-by-step header in
[`deploy/vps/lumo-backend.service`](../../deploy/vps/lumo-backend.service). In
short: build contracts → backend → frontend, copy `web-app/dist` to
`backend/web`, install the unit, then put nginx + certbot in front using
[`deploy/vps/nginx.conf`](../../deploy/vps/nginx.conf):

```bash
sudo certbot --nginx -d $LUMO_DOMAIN    # provisions + auto-renews TLS
```

---

## 3. First run — become the feedback admin

1. Open `https://$LUMO_DOMAIN`, register your account, and **bind your email**
   (Settings → account), then verify it.
2. Put that email in `LUMO_ADMIN_EMAILS` (comma-separated for multiple admins),
   then restart the app (`docker compose up -d` / `systemctl restart
   lumo-backend`).
3. Settings → **About & Support** now shows the admin triage panel: every user's
   in-app feedback, where you set a status and write a reply the submitter sees.
   The public GitHub Issues link stays available too.

The admin gate is an email allow-list, not a database role — so a database leak
grants nobody admin, and you flip operators with one env change.

---

## 4. Logs

The app logs one JSON object per line to stdout/stderr.

- **Docker**: `docker compose logs -f app`, or ship stdout to your collector.
- **systemd**: `journalctl -u lumo-backend -f`.
- **File on disk**: set `LUMO_LOG_FILE=/var/log/lumo/backend.log` to *also* append
  every line to a file (the compose file mounts a `lumo-logs` volume at
  `/var/log/lumo`). Rotate it with `logrotate` (`copytruncate`). The level filter
  and secret redaction apply before anything is written. Full details in
  [`docs/ops/logging.md`](./logging.md).

No third-party log service or Sentry is required.

---

## 5. Backups

Your data lives in Turso, so backups are a Turso concern, not a disk concern:

```bash
turso db shell lumo ".dump" > lumo-$(date +%F).sql   # run on a schedule off-box
```

There is also a committed, opt-in scheduled backup workflow
(`.github/workflows/db-backup.yml`) and a runbook at
[`docs/ops/database-backup.md`](./database-backup.md). Test a restore before you
rely on it.

---

## 6. Pre-launch / compliance checklist

Ensuring the deployment is compliant and launch-ready:

- [ ] **HTTPS only** — Caddy (or certbot) is serving a valid cert; HSTS is on
      (both the app and the proxy set it). Verify with a TLS checker.
- [ ] **Secrets are unique and off-git** — `.env` is gitignored; the two crypto
      secrets were freshly generated, not copied from any example.
- [ ] **Database persistence verified** — you're on Turso (not the ephemeral file
      DB); redeploy and confirm data survives.
- [ ] **Backups scheduled and a restore tested.**
- [ ] **Email** — if you enable password reset / verification, set a real
      provider (`LUMO_EMAIL_PROVIDER=resend` + `LUMO_EMAIL_FROM` +
      `LUMO_RESEND_API_KEY`) and a verified sender domain.
- [ ] **Legal pages current** — Terms/Privacy reflect this hosted deployment
      (data stored on your server, subprocessors you actually use). See
      `docs/legal/`.
- [ ] **Marketing claims match reality** — the site copy is the reconciled,
      truthful wording (`docs/legal/landing-copy-reconciliation.md`).
- [ ] **Admin list scoped** — `LUMO_ADMIN_EMAILS` contains only operators.
- [ ] **Metrics locked down** — `/metrics` is disabled unless you set
      `LUMO_METRICS_TOKEN`.

See also [`docs/security/pre-launch-security-review.md`](../security/pre-launch-security-review.md)
and [`docs/LAUNCH_CHECKLIST.md`](../LAUNCH_CHECKLIST.md).
