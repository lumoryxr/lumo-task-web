# Overnight Backlog — non-colliding pick-list

> **Purpose.** A single, prioritized pick-list for the **overnight cron lane** (Mina, using Jalen's token while he sleeps). Each cron run: if it can ship, pick the **top unchecked item here**, do it through the full flow, then check it off + log a line in `memory/YYYY-MM-DD.md`; otherwise `HEARTBEAT_OK`.
>
> **Why a separate list.** `docs/ROADMAP.md` is the single source of truth for the **autonomous engineering loop** (`lumo-auto-engineering-loop`, every 2h). To avoid two agents racing the same code, this overnight lane deliberately works **only where the loop doesn't**: marketing execution, contributor onboarding, docs, and low-risk chores. **Do not** pick ROADMAP Phase-1/2/3 code items here — those belong to the loop.

## Working rules (non-negotiable)
- **Contract-first / TDD / all local gates green** before any PR. Small, single-concern PRs.
- Frontend vitest: `NODE_ENV=test npx vitest run … --maxWorkers=2`; **always run the standards + i18n guard suites** (`src/test/standards/`, `src/i18n/__tests__/strings.test.ts`) before pushing FE.
- **Every PR: actually run `/code-review`, write the result back as a PR comment, then merge** (docs-only → `low`).
- Conservative only. **No large refactors, no risky/irreversible ops.** Decide by the recommended option yourself; leave only *pure product decisions* for Jalen (below).
- Rebase on `origin/main` first each run; branches for merged work are stale — start fresh from `main`.

---

## Pick-list (top-down)

### A. Docs & contributor onboarding (safe, no auth needed)
- [x] **CONTRIBUTING.md** — already existed at `.github/CONTRIBUTING.md` (comprehensive: workflow/roles, branch + Conventional-Commits conventions, PR checklist, local dev). Gap filled in #500: FE vitest worker-cap (`--maxWorkers`, OOM) + the standards/i18n guard suites that run in CI. *(2026-08-16)*
- [x] **Issue/PR templates** — already present: `.github/ISSUE_TEMPLATE/{bug_report,feature_request,epic,story}` + `.github/pull_request_template.md`. *(pre-existing; verified 2026-08-16)*
- [ ] **`docs/marketing/good-first-issues.md` → real GH issues** — re-verify each is still open/unbuilt against current code, then file the still-valid ones (labels `good first issue`, `help wanted`). *Needs Jalen's OK to post publicly — see Blocked list.*
- [~] **README polish pass** — badges (CI, Release, Demo, License, AI-Coded), demo link, and the "100% AI-coded" note are **already live** in `README.md`. Gap found + fixed on 2026-08-16: the license badge and footer referenced a **`LICENSE` file that did not exist** (badge 404, no GitHub license detection) → added the canonical `LICENSE`. The repo's license is **Apache-2.0** (`LICENSE`, README badge, and footer all agree; the "MIT" wording in the original 08-16 note below was a slip — see correction in the Log). *(2026-08-16)*
- [ ] **Screenshot/GIF set for README + launch** — needs a running app + capture; can be scripted via the browser tool. Low risk, high marketing value.

### B. Marketing execution (drafts exist — needs Jalen's product calls first)
- [ ] Fill the 5 open decisions in `docs/marketing/launch-plan.md` §8, then finalize the §9 copy drafts (PH / Show HN / build-in-public / r/SideProject / FAQ). **Blocked on Jalen** — see below.
- [x] Draft a short **CHANGELOG.md** / "what shipped" highlight reel from the ROADMAP Done log. *(Already exists and is actively maintained by the 2h engineering loop — not duplicated here. 2026-08-16)*

### C. Low-risk chores (fill-in when A/B are blocked)
- [x] **`.github/` hygiene** — `SECURITY.md` (responsible-disclosure via GitHub private reporting), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1). Standard, docs-only. *(2026-08-16)*
- [x] **Docs link-check** — swept `docs/**` (58 files); internal links clean. Only non-fix: one stale memory-file ref inside a dated historical QA snapshot (left as-is by design). *(2026-08-16)*
- [x] **`docs/planning/growth-opportunities.md` → ROADMAP hand-off** — added a "Growth-lever candidates" sub-section to `docs/ROADMAP.md` Phase 3: A1→extends #171, A2/A3/C1→new propose-only entries, B1→#170, B2→#174+#171; B3 is Phase-1 polish (not innovative), left out by design. Growth doc annotated with the hand-off mapping. Propose-only, nothing built. *(2026-08-20)*

---

## Blocked on Jalen — decisions (consolidated)
Kept here so there's one place to unblock the overnight lane in the morning.

1. **`launch-plan.md` §8 — 5 launch decisions:** core narrative, community entry point, D-Day, attribution/byline, analytics tool.
2. **Public "100% AI-coded" narrative** — ⚠️ *already live* in `README.md` since 2026-06-11 (badge + intro line + "How this project is built" section). So this is **confirm-or-revert**, not a fresh decision: keep as the headline hook, or soften it. (Strong differentiator, but sets expectations.)
3. **File `good-first-issues.md` as real public GH issues?** — posting is an external action; confirm scope + which ones.
4. **ROADMAP items explicitly marked "needs Jalen":** `#317` bulk-import `.max()` cap (migration-safety), `/register` account-enumeration A-vs-B, SQLite→Postgres ADR trigger, all Phase-3 feature go-aheads.
5. **Turn off the overnight cron** `overnight-lumo-task-web` (job `081d8fb2-2353-4680-a0d0-cf0d8d3be8a0`) once the token-recovery era is over / this lane is no longer wanted.

---

## Log
- 2026-08-16: File created. Overnight lane scoped to complement (not race) the 2h engineering loop; consolidated the pending Jalen decisions.
- 2026-08-16: Shipped `SECURITY.md` + `CODE_OF_CONDUCT.md` (community-health completeness; disclosure/enforcement routed through GitHub private vulnerability reporting, consistent with the project's no-personal-email contact policy). Section-C `.github/` hygiene item done.
- 2026-08-16: Reconciled A1/A2 — both CONTRIBUTING.md and the issue/PR templates **already existed** (this list was stale). Instead of duplicating, filled the one real gap in CONTRIBUTING via #500: the general FE-test pitfalls (vitest worker-cap for OOM; running the `src/test/standards/` + `src/i18n/__tests__/strings.test.ts` guard suites pre-push). Also ran a `docs/**` internal-link sweep — clean except vendored `.agents/skills/` placeholder examples (out of scope) and one stale memory-file ref in a dated QA snapshot (left as-is; historical).
- 2026-08-16: Reconciled B2/C2 — CHANGELOG already exists and is maintained by the 2h engineering loop (not duplicated); `docs/**` link-check completed (clean). With A1/A2/B2/C1/C2 now truthfully marked, the remaining safe-and-unblocked items are effectively down to A5 (screenshot/GIF capture, needs a running app) and C3 (growth→ROADMAP hand-off); the rest are Blocked-on-Jalen.
- 2026-08-20: **C3 done — growth→ROADMAP hand-off.** Registered the growth doc's *product-feature* ideas into `docs/ROADMAP.md` Phase 3 ("Growth-lever candidates" sub-section) so the loop/Jalen adopt from the single source of truth: A1→extends #171 (one-click social-share intents + watermark/backlink), A2 (public read-only share page, product+security PRD), A3 (onboarding share/invite step), C1 (in-app AI dev-log page) as propose-only; B1→#170 (Web Push), B2→#174+#171 cross-linked (not duplicated); B3 (3-step activation) flagged as Phase-1 polish, deliberately not Phase 3. Annotated `growth-opportunities.md` with the mapping. Docs-only, propose-only — nothing built. Safe-and-unblocked lane now: only A5 (running-app screenshot/GIF capture) remains; rest Blocked-on-Jalen.
- 2026-08-16: **Added the missing `LICENSE` file** (MIT, © lumoryxr). The README already advertised MIT (badge + footer) but no `LICENSE` existed anywhere → badge 404'd and GitHub couldn't detect the license. Purely additive, no new decision (license + holder were already declared). A4 reduced to a partial: its badges/demo/narrative were already live; this closed the one real gap. Also corrected Blocked #2 — the "100% AI-coded" narrative has been public since 2026-06-11, so it's a confirm/revert for Jalen, not a pending decision. Safe-and-unblocked lane is now effectively bottomed out (only A5 = running-app capture remains; expect HEARTBEAT_OK until Jalen unblocks).
- 2026-08-22: **License-note correction.** The two 08-16 log lines above describe the added `LICENSE` as "MIT", but the file that actually shipped — and every reference in `README.md` (badge + footer) — is **Apache-2.0**. Verified this run: `LICENSE` header reads "Apache License / Version 2.0", README badge is `license-Apache%202.0`, footer says "Apache License 2.0 © lumoryxr". The "MIT" wording was a slip in the historical note, not a relicensing event; the repo has been Apache-2.0 throughout. Left the dated 08-16 entries intact (historical record) and annotated item A4 above; no code or `LICENSE` change needed — this is a docs-accuracy fix only.
- 2026-08-22: **Domain-cutover straggler sweep done (#527, #528).** After the `lumoryxr.com` cutover, swept the repo for dead old-domain refs. #527 fixed `web-app/index.html` `og:url`+canonical → `task.lumoryxr.com`. #528 fixed `docs/OPERATIONS.md` Prometheus scrape target (still on retired `lumo-task-backend.onrender.com`) → `task.lumoryxr.com`. Verified everything else is intentional: `e2e/environments.json` `production` block already cut over (its `gamma`/Render block is the deliberate pre-prod validator, not stale); `render.yaml`/README onrender refs are `e.g.` placeholders; `app-base-url-lib.test.ts` asserts *against* onrender leakage; duckdns/onrender in dated QA + proposal docs are historical. Cutover leftovers now clean. Safe-and-unblocked lane back to bottomed-out (A5 running-app capture; rest Blocked-on-Jalen).
