# Self-hosted VPS deployment

Run Lumo end-to-end on your own VPS. The design is deliberately small: **one Node
process serves both the JSON API (`/v1`, `/docs`) and the built SPA** on the same
origin (no CORS), with a reverse proxy in front for HTTPS. Data is a **local
SQLite file on a mounted disk**, and deploys are **manual** — you click *Run
workflow* when you want to ship; ordinary commits to `main` only build a
validation image. Everything lives in [`deploy/vps/`](../../deploy/vps).

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

`bootstrap.sh` is the single init script: it installs Docker, prepares the data
disk (critically, `chown`s it so the container can write the DB), clones the repo
to `/opt/lumo`, and scaffolds `.env`.

**You normally don't run it by hand.** The GitHub Actions deploy detects an
uninitialized box (no `/opt/lumo/.git`) and runs `bootstrap.sh` for you on the
first deploy — there's only one place that knows how to set a box up, and the
workflow calls it rather than duplicating the logic.

**Config is GitHub-managed — you don't fill in `.env` on the box.** The deploy
renders `/opt/lumo/deploy/vps/.env` from your GitHub Secrets/Variables on every
run (see [§3.1](#31-one-time-setup--github-managed-config)); `bootstrap.sh` only
scaffolds a placeholder that the deploy overwrites. The one thing the deploy can't
invent is your crypto keys, so it stops with a clear error until `LUMO_JWT_SECRET`
and `LUMO_ENCRYPTION_KEY` are set **in GitHub** (not on the box).

Run `bootstrap.sh` by hand only if you want to provision ahead of time — e.g. to
install Docker before the first deploy so a non-root SSH user picks up the `docker`
group (a freshly added group only applies on the next login, so otherwise the very
first auto-init deploy may need one re-run):

```bash
curl -fsSL https://raw.githubusercontent.com/lumoryxr/lumo-task-web/main/deploy/vps/bootstrap.sh | bash
# or from a checkout:  bash deploy/vps/bootstrap.sh
```

Migrations run automatically on first boot — no manual step.

> **Deploying without GitHub Actions?** If you run `docker compose` on the box by
> hand instead, then `.env` is yours to fill (`$EDITOR /opt/lumo/deploy/vps/.env`)
> — minimum to boot: `LUMO_DOMAIN`, `LUMO_APP_BASE_URL`, `LUMO_JWT_SECRET`,
> `LUMO_ENCRYPTION_KEY`, `LUMO_DATA_DIR`. Don't mix the two: a subsequent Actions
> deploy will overwrite the file from GitHub.

> **Data-disk permissions (the `SQLITE_CANTOPEN` fix).** The app runs as the
> unprivileged `node` user (uid 1000), and a freshly mounted cloud disk is
> root-owned — so without fixing ownership the app can't create `lumo.db` and
> libsql fails with `Unable to open connection to local database /data/lumo.db: 14`
> (`SQLITE_CANTOPEN`). **You normally don't have to do anything:** the container's
> entrypoint starts as root, makes the bind-mounted `/data` writable by the app
> user, then drops privileges — so it self-heals even if the disk was mounted
> *after* `bootstrap.sh` ran, or gets remounted later. `bootstrap.sh` also chowns
> it as a fast path.
>
> If your disk is on a **network filesystem that refuses `chown`** (it enforces a
> fixed owner), the entrypoint logs a warning and the error persists. Point the app
> at the owner the disk grants instead: `stat -c '%u:%g' /mnt/lumo-data`, then set
> `LUMO_UID` / `LUMO_GID` in `.env` to that uid/gid and restart
> (`deploy/vps/lumo.sh restart`).

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

### 2.1 Day-to-day maintenance — `lumo.sh`

For routine ops there's a small wrapper, [`deploy/vps/lumo.sh`](../../deploy/vps/lumo.sh),
so you don't type the long `docker compose -f docker-compose.prod.yml …` each time.
Run it from anywhere (it cd's into `deploy/vps` itself):

```bash
/opt/lumo/deploy/vps/lumo.sh start        # up -d (start the stack)
/opt/lumo/deploy/vps/lumo.sh stop         # stop containers (data + volumes kept)
/opt/lumo/deploy/vps/lumo.sh restart      # restart app + proxy
/opt/lumo/deploy/vps/lumo.sh status       # container status + health
/opt/lumo/deploy/vps/lumo.sh logs app     # tail logs (omit 'app' for all services)
/opt/lumo/deploy/vps/lumo.sh update       # pull the latest image + recreate
/opt/lumo/deploy/vps/lumo.sh backup       # on-box SQLite backup now
/opt/lumo/deploy/vps/lumo.sh fix-perms    # re-chown the data dir from the host
/opt/lumo/deploy/vps/lumo.sh health       # curl /health inside the container
/opt/lumo/deploy/vps/lumo.sh help         # full command list
```

Tip: `sudo ln -s /opt/lumo/deploy/vps/lumo.sh /usr/local/bin/lumo` to just type
`lumo start`, `lumo logs app`, etc. It defaults to the prebuilt-image compose file;
set `LUMO_COMPOSE_FILE=docker-compose.yml` to operate the build-on-box stack.

---

## 3. Manual deploy with GitHub Actions

[`.github/workflows/deploy-vps.yml`](../../.github/workflows/deploy-vps.yml) builds
the image, pushes it to GHCR, then SSHes into the box to `pull` + `up -d` and
smoke `/health`. **Deploying to the VPS is gated so an ordinary commit never
touches production:**

| Trigger | What happens |
|---|---|
| Push to `main` (app paths) | Build the image and push it to GHCR **only** — a build check that proves the app still builds and is deployable. The running VPS is untouched. |
| Manual dispatch (Actions → *Deploy to VPS* → *Run workflow*) | Build **and deploy** the ref you choose. This is the only trigger that touches production. |

Ship when you're ready: **Actions → *Deploy to VPS* → *Run workflow*.** Leave
`ref` as `main` to deploy the tip of main, or enter an **existing** branch, tag,
or commit SHA to deploy that instead.

> The `ref` field takes a git ref that **already exists** — not a new version
> number you want to create. Typing something like `V0.0.1` when no such tag
> exists fails the checkout with `The process '/usr/bin/git' failed with exit
> code 1`. To deploy a specific release, create/push that tag first, then run the
> workflow with it (or just deploy `main`).
>
> Version tags `v*` are owned by the product **Release** workflow (`release.yml`),
> which cuts a GitHub Release — they intentionally do **not** deploy the VPS, so a
> release and a production deploy stay independent.

### 3.1 One-time setup — GitHub-managed config

All runtime config lives in **GitHub → Settings → Secrets and variables →
Actions**, and the deploy job **renders `/opt/lumo/deploy/vps/.env` on the box from
it every run**. GitHub is the single source of truth — you do **not** hand-edit
`.env` on the VPS anymore (it's regenerated on each deploy, so any manual change is
overwritten). To change a value: edit the Secret/Variable, then re-run *Deploy to
VPS*.

**SSH access — add as _Secrets_:**

| Secret | Value |
|---|---|
| `VPS_HOST` | host or `host:port` of the box (e.g. `203.0.113.10` or `203.0.113.10:2222`); port defaults to 22 |
| `VPS_USER` | SSH user (must be in the `docker` group) |
| `VPS_PASSWORD` | that SSH user's password (password auth — no key needed) |

**App config — sensitive values as _Secrets_, non-sensitive as _Variables_** (both
tabs are on the same *Secrets and variables → Actions* page):

| Where | Name | Required? | Value |
|---|---|---|---|
| Secret | `LUMO_JWT_SECRET` | **yes** | `openssl rand -hex 32` — signs sessions; rotating logs everyone out |
| Secret | `LUMO_ENCRYPTION_KEY` | **yes** | `openssl rand -hex 32` — at-rest encryption; rotating makes stored AI keys/tokens unreadable |
| Variable | `LUMO_DOMAIN` | **yes** | your domain, e.g. `app.example.com` |
| Variable | `LUMO_APP_BASE_URL` | **yes** | public URL, e.g. `https://app.example.com` (reset/verify/OAuth links) |
| Variable | `LUMO_DATA_DIR` | no | host path of the mounted data disk; defaults to `/mnt/lumo-data` |
| Variable | `LUMO_ALLOWED_ORIGINS` / `LUMO_ADMIN_EMAILS` / `LUMO_LOG_LEVEL` | no | see [`.env.example`](../../deploy/vps/.env.example) |
| Variable | `LUMO_EMAIL_PROVIDER` / `LUMO_EMAIL_FROM` · Secret `LUMO_RESEND_API_KEY` | no | transactional email (Resend) |
| Secret | `LUMO_AI_KEY` · Variable `LUMO_AI_CLOUD_GLOBAL_CAP` | no | shared server-side AI key + monthly cap |
| Variable | `LUMO_GITHUB_CLIENT_ID` / `LUMO_GITHUB_CALLBACK_URL` · Secret `LUMO_GITHUB_CLIENT_SECRET` | no | GitHub login |
| Secret | `LUMO_METRICS_TOKEN` | no | bearer token for `/metrics` |
| Variable `TURSO_DATABASE_URL` · Secret `TURSO_AUTH_TOKEN` | no | hosted Turso DB instead of the local disk — set **both or neither** |

Unset optional values render as empty, and those features degrade cleanly (email
falls back to a dev outbox, the GitHub-login button hides, `/metrics` is disabled,
etc.). The two crypto **Secrets are required**: if either is missing the deploy
refuses to boot rather than run with blank crypto. The image itself is pushed with
the built-in `GITHUB_TOKEN` (no extra secret), and the deploy runs the exact image
built for the chosen ref.

> Secrets are encrypted at rest and masked in workflow logs; Variables are stored
> and shown in plaintext (so keep genuinely sensitive values in Secrets). The
> rendered `.env` on the box is written `chmod 600`. This is the intentional
> tradeoff for central management: the crypto keys now also live in GitHub, not
> only on the VPS.

The deploy connects over SSH with **password auth** (`VPS_PASSWORD`) — no keypair to
manage. Use a long, unique password and consider `fail2ban` + a non-default SSH port
on the box; if you'd rather use a key later, swap `password:` for `key:` in the
workflow's SSH step.

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
