# Lumo — Public Beta Launch Checklist

> Goal: take Lumo from "engineering-complete" to "safe to hand to external users as a
> **free public beta**." Billing is intentionally **out of scope** for this stage
> (the "Pro" tier stays a disabled *Coming soon*).
>
> Legend: **[done]** shipped · **[partial]** started, needs finishing · **[todo]** not started.
> Priorities: **P0** = must land before external users · **P1** = launch week ·
> **P2** = growth phase.

Lumo's engineering foundation is strong (real multi-tenancy with per-user data
isolation, JWT + rotating refresh tokens, AES-256-GCM secret encryption, SSRF
protection, a full CI test pyramid, bilingual en/zh, PWA). The gaps below are
about **operating a product for real people**, not code quality.

---

## P0 — Blockers before external users

### Legal & compliance
- **[done] Privacy Policy + Terms of Service pages.** Bilingual pages at
  `/legal/privacy` and `/legal/terms`, linked from the registration consent line
  and the marketing footer. ⚠️ **Action required:** the content is a *template* —
  have counsel review it and fill in the company entity, contact email, sub-processor
  list, and governing jurisdiction before launch.
- **[done] Account deletion (right to erasure).** `DELETE /v1/user` cascades across
  every user-scoped table; surfaced in Account → Danger zone behind an email-typing
  confirmation.
- **[done] Data export (right to access / portability).** `GET /v1/user/export`
  returns a secret-free JSON bundle; surfaced in Account → Data & privacy.
- **[todo] Cookie/tracking notice + marketing-claim reconciliation.** The landing
  page currently claims "we don't track usage, collect analytics, or send data to
  any server." That describes local-first desktop mode, but the hosted product is a
  server-backed account system. Reconcile the copy (or scope the claim to the desktop
  app) before launch, and add a cookie/localStorage notice if analytics are added.

### Account usability (depends on email infrastructure)
- **[todo] Email infrastructure.** No transactional email exists (no Resend/Postmark/
  SES). This is the prerequisite for the two items below. Pick a provider, add the
  API key as a backend secret, and add a small `sendEmail()` lib.
- **[todo] Email verification.** `POST /v1/auth/register` issues a session
  immediately with no confirmation, so any typo'd/fake email becomes a live account.
  Add a verification token table + `/v1/auth/verify-email` and gate sensitive actions
  on a verified flag.
- **[todo] Password reset ("forgot password").** There is no recovery path today — a
  locked-out user is stuck. Add `/v1/auth/forgot-password` + `/v1/auth/reset-password`
  with a short-lived, single-use, rate-limited token.
  > Design note: the login page already honestly disables "Forgot password" with a
  > *Coming soon* tooltip, so wiring it is a drop-in, not a UI change.

### Production traps
- **[done] Frontend API-base fallback.** A production build without `VITE_API_BASE`
  no longer silently points at `localhost:47291`; it logs a loud error and falls back
  to same-origin `/v1`. Still **set `VITE_API_BASE` explicitly** in the prod build.
- **[done] Dead marketing/footer links.** Landing footer Privacy/Terms/Contact/
  Documentation/Changelog now point to real destinations.
- **[done] OAuth buttons.** Google/Apple/GitHub buttons are already honestly disabled
  (*Coming soon*) — verify they stay disabled until real OAuth lands, or remove them.

### Data safety
- **[todo] Move off free-tier hosting for anything with real users.** `render.yaml`
  defaults to Render **free** (spins down after 15 min idle, ephemeral disk) and the
  DB assumes Turso free (no point-in-time recovery). Upgrade to a paid/persistent tier
  before onboarding users, or data loss on redeploy is a real risk.
- **[todo] Automated backups.** Only a manual `npm run backup` exists. Schedule a
  recurring logical dump (and/or enable Turso PITR on a paid plan). Verify a restore.

---

## P1 — Launch week

- **[todo] Error tracking.** No Sentry (or equivalent) anywhere. Wire it behind a
  `SENTRY_DSN` env var on both backend (`app.onError`) and frontend (`ErrorBoundary`)
  so production faults are visible. Without it you learn about outages from users.
- **[todo] Product analytics (privacy-friendly).** No analytics today. Add a
  cookieless option (Plausible) or a self-hosted one (PostHog) to measure the
  register → activate → retain funnel. Reconcile with the privacy notice above.
- **[todo] Rate-limit & token-revocation durability.** The rate limiter and revoked-
  token cache are per-process in-memory — they reset on restart and don't share state
  across instances. For a single instance this is fine; before horizontal scaling,
  move them to shared storage (Turso/Upstash) or pin to one instance.
- **[todo] Fix `ARCHITECTURE.md` drift.** It claims Drizzle ORM + Postgres + a
  services layer; the real backend is raw parameterized SQL over libSQL. Correct it so
  new contributors aren't misled.
- **[todo] Support & feedback channel.** No in-app support/feedback path. At minimum,
  a "Contact / report a bug" link (email or GitHub issues) and a monitored inbox.

---

## P2 — Growth phase

- **[todo] Postgres migration ADR.** SQLite/Turso is single-writer; write contention
  is the scaling ceiling. Write the ADR (already on the roadmap) before large-scale
  rollout or team features.
- **[todo] Desktop installer signing.** The Windows installer is unsigned (SmartScreen
  warning). Code-sign it before promoting desktop downloads widely.
- **[todo] Consolidate the two marketing surfaces.** There is both a static
  `landing/index.html` and an Astro `website/`. Pick one canonical site.
- **[todo] Open-graph / Twitter cards on the app shell** for shareable links
  (the app `index.html` has PWA meta but no OG/Twitter cards).

---

## What this PR shipped

- Contract-first `@lumo/contracts` `user` schemas (profile, export, delete) + OpenAPI.
- Backend `GET /v1/user/export` and `DELETE /v1/user` with tenant-isolation and
  no-secret-leak tests.
- Account → Data & privacy (export) and Danger zone (delete) UI, with an email-typing
  confirmation gate.
- Bilingual Privacy Policy and Terms of Service pages, wired into registration + footer.
- Production API-base misconfiguration guard; fixed dead landing footer links.
- This checklist and `GO_TO_MARKET.md`.
