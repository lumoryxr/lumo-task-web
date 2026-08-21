# Good First Issues — starter set for contributors

> Drafted 2026-07-13 (overnight). Purpose: seed the `good first issue` / `help wanted` labels so
> new contributors have an on-ramp (see `docs/marketing/launch-plan.md` §4). **Before filing each
> one to GitHub, re-verify it's still open** (the autonomous loop may have shipped it) and confirm
> the file pointers on current `main`. Each is intentionally small, isolated, and testable.
>
> Labels available: see `.github/labels.json`. Suggested per-issue labels below.
> House rules a contributor must follow: `.github/CONTRIBUTING.md`, `CLAUDE.md`, and the local
> gates in `TESTING.md` (typecheck + tests before commit; `web-app` vitest with `--maxWorkers=2`
> and `NODE_ENV=test`).

## Re-verification status — 2026-08-21

Re-checked all 10 against current `main` before any public filing. **5 are already shipped/satisfied
and must NOT be filed** (they'd be closed-on-arrival); 5 remain fileable.

| # | Title | Status | Evidence on `main` |
|---|-------|--------|--------------------|
| 1 | README `.env.example` + one-command dev | ✅ **Satisfied** | README "Quick Start" is copy-paste ready (Node 22+, `git clone`, `make dev-full`, ports, Make-targets table). Only residual: no `web-app/.env.example` (app runs via `make dev-full` without it). |
| 2 | "Why contribute" blurb in README | ✅ **Shipped** (PR #517) | `README.md` "Why contribute here?" section. |
| 3 | `EmptyState` CTA component test | ✅ **Shipped** | `web-app/src/components/__tests__/EmptyState.test.tsx` — 5 tests incl. CTA-fires-handler, no-CTA branch, `aria-hidden` icon. |
| 4 | icon-only `aria-label` audit (one page) | 🟢 **Fileable** | Still a valid per-page hardening task. |
| 5 | Loading skeleton for a bare-`Loading…` page | ✅ **Satisfied** | No bare `app.loading` text left in `src/pages`; loading states use `Spinner`/`aria-busy`/skeletons. |
| 6 | Consistent focus-ring/hover on one list | 🟢 **Fileable** | Still valid; ties to open "Visual consistency" work. |
| 7 | i18n CI reminder in CONTRIBUTING | ✅ **Shipped** (via #500) | `.github/CONTRIBUTING.md` already documents the standards + i18n guard suites and `--maxWorkers`. |
| 8 | DFX bounds case (mentored) | 🟢 **Fileable** | Still valid; needs a maintainer to point at a safe endpoint. |
| 9 | Pin Node with `.nvmrc` / `engines` | 🟢 **Fileable** | No root `.nvmrc` yet; `backend/package.json` has `engines`. Task narrows to: add `.nvmrc` matching CI (Node 22). |
| 10 | Keyboard shortcut hint | 🟢 **Fileable** | `CommandPalette.tsx` exists; surfacing a hint is still open. |

> **Refill note:** fileable set is now **5**, below the target 8–12 (launch-plan §4.2). Draft a few
> fresh starters before the public launch push. Shipped items are marked ✅ below but kept for provenance.

---

## How to use this file
1. Pick an item, copy the block into a new GitHub issue.
2. Apply labels: `good first issue`, plus the area label (e.g. `frontend`, `docs`, `a11y`, `test`).
3. Add the acceptance criteria as a checklist so a newcomer knows "done".
4. When the issue is filed or shipped, strike it here.

---

### 1. [docs] Add a `.env.example` walkthrough + "one-command dev" block to README ✅ *Satisfied (2026-08-21)*
> README "Quick Start" already covers this. Only residual: a `web-app/.env.example` pointer — too small to file alone.
**Area:** docs · **Difficulty:** ⭐ (very easy)
**Why:** The fastest way to lose a new contributor is a fuzzy setup. Make "clone → run" copy-pasteable.
**Scope:** In `README.md` (and `README.zh.md`), add a short "Run it locally in 2 minutes" section: prerequisites (Node version), the exact commands to install + start `backend` and `web-app`, and a pointer to `.env.example`. Cross-check against the real scripts in `backend/package.json` and `web-app/package.json`.
**Acceptance:** A newcomer following only the README gets both servers running; commands verified accurate; EN + ZH parity.

### 2. [docs] "Why contribute" + project-experiment blurb in README ✅ *Shipped — PR #517 (2026-08-20)*
**Area:** docs · **Difficulty:** ⭐
**Why:** This repo's hook is that it's 100%-AI-coded with a strict review process — say so, and invite people to join the experiment (launch-plan §4.1).
**Scope:** Add a short "Why contribute" section to `README.md`/`README.zh.md`: the AI-driven experiment, the modern stack, the CI/review rigor, and a link to good-first-issues + CONTRIBUTING.
**Acceptance:** Section reads clearly; links resolve; EN + ZH parity.

### 3. [test] Component test for `EmptyState`'s optional CTA path ✅ *Shipped — `EmptyState.test.tsx` (2026-08-21 verify)*
**Area:** test · **Difficulty:** ⭐⭐
**Why:** `src/components/EmptyState.tsx` is reused across pages; lock its contract.
**Scope:** In `src/components/__tests__/`, add tests asserting: renders title/subtitle, icon is `aria-hidden`, `role=status`, and the optional CTA renders + fires its handler only when provided. Follow the existing pattern in `__tests__/skeletons.test.tsx`.
**Acceptance:** New test file green under `NODE_ENV=test npx vitest run <file> --maxWorkers=2`; covers the with-CTA and without-CTA branches.

### 4. [frontend/a11y] Audit icon-only buttons on one page for `aria-label`
**Area:** a11y · **Difficulty:** ⭐⭐
**Why:** Accessibility pass shipped broadly (ROADMAP Phase 1), but a newcomer can harden one page end-to-end.
**Scope:** Pick one page (e.g. `src/pages/CountdownPage.tsx` or `HabitsPage.tsx`), find every icon-only `<button>`, ensure each has a localized `aria-label` via `t()`. Add any missing i18n keys to `src/i18n` (EN + ZH).
**Acceptance:** Every icon-only control on the chosen page has a localized accessible name; i18n key-presence guard stays green; no hardcoded strings.

### 5. [frontend] Loading skeleton for a page that still shows bare "Loading…" ✅ *Satisfied (2026-08-21)*
> No bare `app.loading` text remains in `src/pages`; loading states use `Spinner`/`aria-busy`/skeletons.
**Area:** frontend · **Difficulty:** ⭐⭐
**Why:** Skeletons exist for Today/Stats/Habits/Projects; extend the pattern to any remaining page that still renders plain `app.loading` text (verify which — e.g. Countdown or a project sub-view).
**Scope:** Reuse `Skeleton`/`SkeletonScreen` from `src/components/Skeleton.tsx` + `skeletons.tsx`; add a content-shaped skeleton for the target page's loading state; honor `prefers-reduced-motion` + in-product `reducedMotion` (mirror existing skeletons). Add a small component test.
**Acceptance:** Target page shows a token-driven skeleton while loading; `role=status`/`aria-busy` semantics match existing ones; reduced-motion collapses animation; test green.

### 6. [frontend] Consistent focus-ring / hover on one interactive list
**Area:** frontend · **Difficulty:** ⭐⭐
**Why:** Ties into the open "Visual consistency" ROADMAP item at a newcomer scale.
**Scope:** Pick one list/card grid (e.g. Projects or People) and ensure hover/`:focus-visible` states use the shared design tokens (no ad-hoc `px`/colors). Reference the token system in `web-app/src` (Tailwind tokens) and existing `.btn`/card styles.
**Acceptance:** States are keyboard-visible and token-driven; no new ad-hoc color/spacing literals; screenshots before/after in the PR.

### 7. [i18n] Add a missing-key CI reminder to CONTRIBUTING ✅ *Shipped — via PR #500*
**Area:** docs · **Difficulty:** ⭐
**Why:** There's already a static key-presence guard + render-layer Playwright guard (ROADMAP i18n). Document how to run them so contributors don't get surprised by red CI.
**Scope:** In `.github/CONTRIBUTING.md`, add a short "i18n rules" note: every user-facing string via `t()`, EN + ZH parity, and the exact command to run the i18n guard locally.
**Acceptance:** Note is accurate to the real guard command; links to the i18n dir.

### 8. [test] Add one DFX robustness case for an un-bounded input (mentored)
**Area:** test · **Difficulty:** ⭐⭐⭐ (mentored)
**Why:** The daily DFX suite (`backend/src/test/dfx.integration.test.ts`) is auto-replenished; a guided contributor can add a bounds case for a small endpoint and learn the mutation-testing convention.
**Scope:** Pick a small endpoint with a string/array field lacking an explicit `.max()`; add a DFX robustness case over real HTTP + real SQLite; update `docs/testing/dfx-coverage-matrix.md`. Pair on this via PR review.
**Acceptance:** New case fails when the bound is removed (mutation-tested teeth) and passes on current code; matrix updated. *(Label `help wanted` — needs a maintainer to point at a safe endpoint.)*

### 9. [dx] Pin Node version with `.nvmrc` / `engines` and document it
**Area:** dx · **Difficulty:** ⭐
**Why:** Removes "works on my machine" setup friction for contributors.
**Scope:** Verify the intended Node version; add/confirm `.nvmrc` and `engines.node` in the relevant `package.json`s; mention it in the README setup block.
**Acceptance:** `.nvmrc` present and matches CI's Node; README references it.

### 10. [frontend] Keyboard shortcut hint in the command palette / empty states
**Area:** frontend · **Difficulty:** ⭐⭐
**Why:** "Keyboard-friendly" is a PRD design pillar; surfacing shortcuts aids discoverability (and makes a nice small win).
**Scope:** Add a subtle, localized shortcut hint (e.g. show the palette hotkey in an empty state or topbar tooltip). Reuse existing modal/palette a11y (`useModalA11y`). Keep it token-driven and reduced-motion safe.
**Acceptance:** Hint is localized (EN + ZH), discoverable, non-intrusive; no a11y regressions.

---

## Notes for the maintainer
- Keep **8–12 open** at any time; refill as they're taken (launch-plan §4.2). **As of 2026-08-21 only
  5 remain fileable (#4, #6, #8, #9, #10)** — draft fresh starters before the public launch push.
- For each, respond to a first-time contributor's PR within ~48h even if only to acknowledge.
- Of the still-fileable set: **#9** is pure-DX and safe for anyone; **#4, #6, #10** touch UI with existing
  patterns to copy; **#8** needs a maintainer to point at a safe endpoint first.
