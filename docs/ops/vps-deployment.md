# Self-hosted VPS deployment

Run Lumo end-to-end on your own VPS. The design is deliberately small: **one Node
process serves both the JSON API (`/v1`, `/docs`) and the built SPA** on the same
origin (no CORS), with a reverse proxy in front for HTTPS. Data is a **local
SQLite file on a mounted disk**, and releases ship via **GitHub Actions
push-to-deploy**. Everything lives in [`deploy/vps/`](../../deploy/vps).

This is the recommended shape for a public beta: always-warm (no free-tier
cold-start), low latency (SPA↔API in-process), and cheap to run.

- **Persistence** → a SQLite file on your provider's block/cloud disk. It survives
  redeploys and is a plain file you can copy. (Hosted Turso is still supported as
  an alternative — see [Using Turso instead](#using-turso-instead).)
- **Deploys** → CI builds a Docker image, pushes it to GHCR, and the VPS pulls it.
  The small box never runs `npm`/Vite.
- **TLS + domain** → free. Caddy auto-provisions Let's Encrypt; a DuckDNS
  subdomain gives you a free hostname. See [Free domain + HTTPS](#free-domain--https).

---

## 0. Prerequisites

- A VPS (1 vCPU / 1 GB RAM is enough for a small beta) running a recent Linux,
  with a **block/cloud disk mounted** (e.g. at `/mnt/lumo-data`) for the database.
- A hostname pointing at the VPS (free options in
  [Free domain + HTTPS](#free-domain--https)), with ports **80 and 443** open
  (80 is needed for the ACME/Let's Encrypt challenge).
- Two secrets, generated once:
  ```bash
  openssl rand -hex 32   # LUMO_JWT_SECRET
  openssl rand -hex 32   # LUMO_ENCRYPTION_KEY
  ```
  > ⚠️ Treat both as permanent. Rotating `LUMO_JWT_SECRET` signs everyone out;
  > rotating `LUMO_ENCRYPTION_KEY` makes stored secrets (users' AI keys, sync
  > tokens) unreadable.

---

## 1. First-time setup (bootstrap)

On the box, run the bootstrap script — it installs Docker, prepares the data disk
(critically, `chown`s it so the container can write the DB), clones the repo to
`/opt/lumo`, and scaffolds `.env`:

```bash
curl -fsSL https://raw.githubusercontent.com/lumoryxr/lumo-task-web/main/deploy/vps/bootstrap.sh | bash
# or from a checkout:  bash deploy/vps/bootstrap.sh
```

Then fill in the secrets it created:

```bash
$EDITOR /opt/lumo/deploy/vps/.env
```

Minimum to boot: `LUMO_DOMAIN`, `LUMO_APP_BASE_URL`, `LUMO_JWT_SECRET`,
`LUMO_ENCRYPTION_KEY`, and `LUMO_DATA_DIR` (the host path of your mounted disk —
must match the box). The rest degrade cleanly when unset (see the comments in
`.env.example`). Migrations run automatically on first boot — no manual step.

> **Why the `chown`?** The container runs as the unprivileged `node` user
> (uid 1000). A freshly mounted disk is root-owned, so without
> `chown -R 1000:1000 /mnt/lumo-data` the app can't create `lumo.db`. `bootstrap.sh`
> does this for you; if you mount the disk *after* bootstrapping, re-run it (it's
> idempotent) or run the `chown` yourself.

---

## 2. Bring it up

```bash
# One-time so the box can pull the private image (or make the GHCR package public):
docker login ghcr.io          # username = GitHub user, password = a read:packages PAT

cd /opt/lumo/deploy/vps
docker compose -f docker-compose.prod.yml up -d
```

Caddy fetches and auto-renews a Let's Encrypt certificate for `LUMO_DOMAIN` and
reverse-proxies to the app. Watch it come up:

```bash
docker compose -f docker-compose.prod.yml logs -f app     # app boot + JSON access logs
docker compose -f docker-compose.prod.yml logs -f caddy   # certificate issuance
curl -fsS https://$LUMO_DOMAIN/health && echo ok
```

**Build on the box instead of pulling?** Use `docker-compose.yml` (it has a
`build:` section) with `docker compose up -d --build`. Slower on a small VPS;
prefer the prebuilt image for routine deploys.

---

## 3. Push-to-deploy with GitHub Actions

[`.github/workflows/deploy-vps.yml`](../../.github/workflows/deploy-vps.yml) builds
the image, pushes it to GHCR, then SSHes into the box to `pull` + `up -d` and
smoke `/health`. It runs on **manual dispatch** (Actions → *Deploy to VPS* → *Run
workflow*) and on pushes to `main` that touch the app.

One-time setup — repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VPS_HOST` | public IP / hostname of the box |
| `VPS_USER` | SSH user (must be in the `docker` group) |
| `VPS_SSH_KEY` | that user's **private** key (box holds the matching public key) |
| `VPS_SSH_PORT` | optional; defaults to 22 |

The image is pushed with the built-in `GITHUB_TOKEN` (no extra secret). Runtime
secrets (`LUMO_JWT_SECRET`, …) live **only** in the VPS `.env` — never in CI. The
deploy step refreshes `deploy/vps/` from `main` on the box (leaving the gitignored
`.env` intact) and deploys the exact image built for that commit.

---

## 4. First run — become the feedback admin

1. Open `https://$LUMO_DOMAIN`, register, and **bind your email** (Settings →
   account), then verify it.
2. Put that email in `LUMO_ADMIN_EMAILS` (comma-separated for multiple admins) in
   `.env`, then restart: `docker compose -f docker-compose.prod.yml up -d`.
3. Settings → **About & Support** now shows the admin triage panel: every user's
   in-app feedback, where you set a status and write a reply the submitter sees.
   The public GitHub Issues link stays available too.

The admin gate is an email allow-list, not a database role — a database leak
grants nobody admin, and you flip operators with one env change.

---

## 5. Backups

The database is a file on your disk, so back the file up.
[`deploy/vps/backup.sh`](../../deploy/vps/backup.sh) takes a consistent online
snapshot (`sqlite3 .backup`, no downtime), gzips it, prunes old copies, and can
push off-box via `rclone`:

```bash
bash /opt/lumo/deploy/vps/backup.sh                       # writes to $LUMO_DATA_DIR/backups
# schedule it (daily 03:15):
echo '15 3 * * * /opt/lumo/deploy/vps/backup.sh >> /var/log/lumo/backup.log 2>&1' | crontab -
```

For durability, set `RCLONE_REMOTE` (e.g. an S3/R2 bucket) so a copy leaves the
box. Test a restore before you rely on it: `gunzip -c dump.db.gz > restored.db`
then point `LUMO_DB_PATH` at it.

> The committed `.github/workflows/db-backup.yml` is the **Turso**-mode backup and
> stays inactive (skips cleanly) when you're on local SQLite — use `backup.sh`.

---

## 6. Logs

The app logs one JSON object per line to stdout/stderr.

- **Docker**: `docker compose -f docker-compose.prod.yml logs -f app`.
- **File on disk**: set `LUMO_LOG_FILE=/var/log/lumo/backend.log` to *also* append
  every line to a file (the compose file mounts a `lumo-logs` volume at
  `/var/log/lumo`). Rotate with `logrotate` (`copytruncate`). The level filter and
  secret redaction apply before anything is written. See
  [`docs/ops/logging.md`](./logging.md).

No third-party log service or Sentry is required.

---

## Free domain + HTTPS

HTTPS is already free: Caddy auto-provisions and renews a Let's Encrypt cert for
`LUMO_DOMAIN`. You just need a hostname pointing at the box.

- **Fully free (recommended): [DuckDNS](https://www.duckdns.org) + Caddy.** Create
  `yourname.duckdns.org` (free), point its A record at the VPS IP, and set
  `LUMO_DOMAIN=yourname.duckdns.org` + `LUMO_APP_BASE_URL=https://yourname.duckdns.org`.
  Caddy issues the cert over the HTTP-01 challenge (ports 80+443 open). $0, real
  HTTPS — the only trade-off is a `*.duckdns.org` URL rather than a branded domain.
- **Nicer URL (~$1–12/yr): a cheap domain + Cloudflare free DNS.** Buy a domain,
  use Cloudflare's free plan for DNS. Keep Caddy/Let's Encrypt, or turn on
  Cloudflare's proxy for free Universal SSL that also hides the origin IP.
- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
  (free)** — if you put a domain on Cloudflare: no open ports / no public IP
  needed, free edge TLS. Good behind CGNAT.
- **Quick IP-only test:** `sslip.io` / `nip.io` map an IP to a hostname so Caddy
  can issue a cert with no domain at all — smoke-testing only, not for the beta.
- **Avoid Freenom** (`.tk`/`.ml`) — effectively defunct.
- **China note:** if the VPS is in mainland China, serving a domain on 80/443
  requires ICP 备案; most betas use an overseas VPS (HK/SG/US) to skip it.

---

## Alternatives

### Using Turso instead

Prefer a hosted database to a local disk? Set `TURSO_DATABASE_URL` +
`TURSO_AUTH_TOKEN` in `.env` (both or neither — the backend refuses to boot with
only one) and the app switches to direct-cloud mode, taking precedence over the
local file. Create the DB with `turso db create lumo && turso db show --url lumo &&
turso db tokens create lumo`. Backups then use `db-backup.yml` /
[`docs/ops/database-backup.md`](./database-backup.md) rather than `backup.sh`.

### systemd + nginx (no Docker)

Build on the host and run under systemd; see the step-by-step header in
[`deploy/vps/lumo-backend.service`](../../deploy/vps/lumo-backend.service) and put
nginx + certbot in front using [`deploy/vps/nginx.conf`](../../deploy/vps/nginx.conf):

```bash
sudo certbot --nginx -d $LUMO_DOMAIN    # provisions + auto-renews TLS
```

Set `LUMO_DB_PATH` to a path on your mounted disk (e.g.
`/mnt/lumo-data/lumo.db`) so data persists.

---

## 7. Pre-launch / compliance checklist

- [ ] **HTTPS only** — Caddy (or certbot) is serving a valid cert; HSTS is on
      (both the app and the proxy set it). Verify with a TLS checker.
- [ ] **Secrets are unique and off-git** — `.env` is gitignored; the two crypto
      secrets were freshly generated, not copied from any example.
- [ ] **Database persistence verified** — `LUMO_DATA_DIR` points at a real mounted
      disk (not the root filesystem); redeploy and confirm data survives. Confirm
      the data dir is owned by uid 1000.
- [ ] **Backups scheduled and a restore tested** (`backup.sh` in cron; ideally
      `RCLONE_REMOTE` set for an off-box copy).
- [ ] **Email** — if you enable password reset / verification, set a real provider
      (`LUMO_EMAIL_PROVIDER=resend` + `LUMO_EMAIL_FROM` + `LUMO_RESEND_API_KEY`)
      and a verified sender domain.
- [ ] **Legal pages current** — Terms/Privacy reflect this hosted deployment
      (data stored on your server, subprocessors you actually use). See `docs/legal/`.
- [ ] **Marketing claims match reality** — site copy is the reconciled wording
      (`docs/legal/landing-copy-reconciliation.md`).
- [ ] **Admin list scoped** — `LUMO_ADMIN_EMAILS` contains only operators.
- [ ] **Metrics locked down** — `/metrics` is disabled unless you set
      `LUMO_METRICS_TOKEN`.

See also [`docs/security/pre-launch-security-review.md`](../security/pre-launch-security-review.md)
and [`docs/LAUNCH_CHECKLIST.md`](../LAUNCH_CHECKLIST.md).
