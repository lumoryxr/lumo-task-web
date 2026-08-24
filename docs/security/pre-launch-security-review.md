# Pre-launch security review checklist

> Scope + checklist for the external security review / self-audit before charging
> (`docs/business/commercialization-readiness.md` §6, issue #474). Use it two ways: (1) as
> the brief handed to an external reviewer, and (2) as a self-audit gate.
>
> **Baseline already in place:** 104 built-in security tests (authn / authz /
> input / secrets / rate-limit), contract-level input validation at every route
> boundary, parameterized SQL only, JWT rotation + reuse-detection, AES-256-GCM
> at-rest encryption, DNS-rebinding-hardened SSRF protection, and (this PR)
> `npm audit` + Dependabot across web-app / backend / **contracts**.

## Highest-priority surfaces (focus the external review here)

### 1. Payment webhook — **when billing (#470) lands**
- [ ] Signature verification on every webhook (Stripe-Signature or equivalent) —
      reject unsigned / bad-signature payloads before any side effect.
- [ ] **Idempotency** — a replayed or duplicate event must not double-apply
      (grant entitlement / extend plan) exactly once per event id.
- [ ] Amount / currency / customer are read from the **verified event**, never
      from client input.
- [ ] Failure path is observable — a dropped/failed webhook alerts (see
      reliability-monitoring §2), never silently loses a paid upgrade.

### 2. OAuth callback (GitHub sign-in)
- [ ] `state` parameter is generated, single-use, and verified on callback (CSRF
      on the OAuth flow).
- [ ] Redirect/callback URL is allow-listed (`LUMO_GITHUB_CALLBACK_URL`), no
      open-redirect via a client-controlled `redirect_uri`.
- [ ] Account-linking can't be used to take over an existing account (email
      collision handling).

### 3. Sessions & tokens
- [ ] Access-token TTL short (30m) + refresh rotation with **reuse detection**
      (family revoke on replay) — verify the theft-response path.
- [ ] Sign-out revokes the presented access token (blocklist) **and** the refresh
      token; password change invalidates the session family.
- [ ] Tokens in localStorage is an accepted trade-off for this Electron/web app —
      confirm no token leaks via logs / error bodies / URLs.

## Standard dimensions (self-audit, tests exist)

- [ ] **Authn** — every protected route behind `authMiddleware`; no route
      accidentally public (audit the route table; the calendar `.ics` feed is the
      *only* intended public, token-capability endpoint).
- [ ] **Authz / tenancy** — every query re-scoped by `user_id`; no IDOR on
      `:id` paths (cross-tenant read/write/delete all 404, not 200).
- [ ] **Input** — Zod validation at every boundary; body-size bounds; oversized
      `:id` / array / string caps enforced (contract-first).
- [ ] **Secrets** — never returned by any endpoint (`hasKey: boolean` only);
      `enc:v1` blobs never echoed in cleartext; `secret-policy` fails fast on weak
      boot secrets.
- [ ] **Rate limiting** — auth + AI endpoints rate-limited at the middleware
      level; confirm limits are sane for real traffic (note: current limiter is
      in-process memory — see reliability §"限流持久化" before multi-instance).
- [ ] **SSRF** — outbound fetch (AI providers, OAuth, Outlook proxy) goes through
      the IP-pinning dispatcher; localhost/link-local/metadata IPs blocked at
      connect time.
- [ ] **Transport / headers** — HTTPS only; CORS locked to
      `LUMO_ALLOWED_ORIGINS`; security headers reviewed.

## Known residuals to disclose to the reviewer

- [ ] **Migration atomicity tail (#17)** — the `users` table rebuild isn't wrapped
      in a transaction (matches the repo's migration style; crash window is tiny).
      Consider transaction-hardening before scale.
- [ ] **In-memory rate-limit / token-revocation** — single-process only; migrate
      to shared storage (Turso/Upstash) before horizontal scale, or pin to one
      instance.
- [ ] **`LUMO_ENCRYPTION_KEY` rotation** has no re-encryption migration yet — see
      the runbook; rotating it today would strand existing `enc:v1` blobs.

## Process

- [ ] Run the full security suite: `cd backend && npm run test:security`.
- [ ] Confirm CI dependency audit is green (`security` job) and Dependabot is
      current.
- [ ] Commission the external review **after** the payment webhook + OAuth flows
      are code-complete (that's where the highest-value findings live).
- [ ] Track findings as issues under the security epic (#474); gate charging on
      the P0/P1 ones.
