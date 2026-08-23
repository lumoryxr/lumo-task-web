# Good First Issues — starter set for contributors

> Drafted 2026-07-13 (overnight). Purpose: seed the `good first issue` / `help wanted` labels so
> new contributors have an on-ramp (see `docs/business/marketing/launch-plan.md` §4). **Before filing each
> one to GitHub, re-verify it's still open** (the autonomous loop may have shipped it) and confirm
> the file pointers on current `main`. Each is intentionally small, isolated, and testable.
>
> Labels available: see `.github/labels.json`. Suggested per-issue labels below.
> House rules a contributor must follow: `.github/CONTRIBUTING.md`, `CLAUDE.md`, and the local
> gates in `docs/testing/strategy.md` (typecheck + tests before commit; `web-app` vitest with `--maxWorkers=2`
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
| 11 | Social-preview (OG/Twitter) meta tags | 🟡 **Partial** — text meta shipped (PR #522); image half remains | Text `og:*`/`twitter:*`/`description` now live in `index.html`. Still fileable: add `public/og-image.png` (1200×630) + `og:image`/`twitter:image`, upgrade `twitter:card` to `summary_large_image`. Related bug: `icon-192/512.png` referenced by manifest + `apple-touch-icon` but **absent from repo** (see #16). |
| 12 | Bilingual `<html lang>` on language switch | 🟢 **Fileable** | `index.html` hardcodes `lang="en"`; nothing sets `document.documentElement.lang` on the EN/ZH switch (verified — only `.classList` is touched). a11y + SEO gap. |
| 13 | Unit test for `useCoarsePointer` hook | 🟢 **Fileable** | Every sibling in `src/hooks/__tests__` has a test except `useCoarsePointer.ts` (26 lines). |
| 14 | Add `.editorconfig` | 🟢 **Fileable** | No `.editorconfig` at repo root — contributors' editors don't share indent/charset/EOL. |
| 15 | Repo-structure map in CONTRIBUTING | 🟢 **Fileable** | `.github/CONTRIBUTING.md` has no directory/layout map to orient newcomers. |
| 16 | Add the missing PWA icons (`icon-192/512.png`) | 🟢 **Fileable** 🔥 | `manifest.json` + `apple-touch-icon` reference `/icon-192.png` and `/icon-512.png`, but neither exists anywhere in the repo (grep-verified) → broken PWA install icon + apple-touch-icon 404. Needs the two PNGs (brand: bg `#0d1210`, accent `#3dffa0`) added to `web-app/public/`. Unblocks #11's `og:image` too. |

> **Refill note (2026-08-21):** refilled from 5 → **10 fileable** (#4, #6, #8, #9, #10 + new #11–#15),
> back inside the 8–12 target (launch-plan §4.2). New starters #11–#15 verified against current `main`.
> **Update (2026-08-21, PR #522):** shipped the *text* half of #11 (OG/Twitter/description meta in `index.html`);
> #11 is now 🟡 partial (image half remains) and a new **#16** was filed for the missing `icon-192/512.png` PWA
> assets discovered en route (they gate #11's `og:image`). Net fileable count still ≥ 8.
> Item #1's old "residual `web-app/.env.example`" note is **moot** — the frontend uses **zero**
> `import.meta.env.*` vars (grep-verified), so no frontend `.env.example` is needed.

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

### 11. [frontend/seo] Add social-preview (Open Graph + Twitter) meta tags 🔥 *launch-critical* — 🟡 *text half shipped (PR #522)*
**Area:** frontend · **Difficulty:** ⭐⭐
**Why:** The launch push (Product Hunt / Show HN / Reddit / X — see `launch-plan.md` §9) relies on rich link previews. **Shipped in PR #522:** `<meta name="description">` + `og:type`/`og:site_name`/`og:title`/`og:description`/`og:url`/`og:locale` + `twitter:card=summary`/`twitter:title`/`twitter:description` — so Slack/Discord/Telegram/WhatsApp/iMessage previews now render title + description instead of bare text.
**Remaining (still fileable):** the **image** half. Add a `web-app/public/og-image.png` (1200×630), then add `og:image`/`og:image:width`/`og:image:height`/`twitter:image` and upgrade `twitter:card` to `summary_large_image`. **Blocked by #16** (the referenced `icon-192/512.png` don't exist yet — the same asset gap). Keep copy aligned with the README one-liner + `launch-plan.md` fact baseline (Eisenhower matrix + Pomodoro + AI classify; Apache-2.0).
**Acceptance:** A shared URL renders a title, description, **and preview image** in a validator (e.g. opengraph.xyz / X card validator); no build warnings; copy matches README.

### 16. [frontend/bug] Add the missing PWA icons (`icon-192.png` / `icon-512.png`) 🔥
**Area:** frontend · **Difficulty:** ⭐⭐
**Why:** `web-app/public/manifest.json` declares `/icon-192.png` + `/icon-512.png` and `index.html` sets `apple-touch-icon` to `/icon-192.png`, but **neither file exists anywhere in the repo** (grep-verified). Result: broken PWA install icon and a 404 apple-touch-icon on iOS home-screen add. This also blocks #11's `og:image`.
**Scope:** Add the two PNGs to `web-app/public/` at exactly `icon-192.png` (192×192) and `icon-512.png` (512×512), on brand (background `#0d1210`, accent `#3dffa0`, matching `theme_color`). A single source (e.g. an SVG mark) exported at both sizes keeps them consistent; the 512 doubles as a base for the launch `og-image.png`.
**Acceptance:** Both files exist at the exact referenced paths and correct dimensions; installing the PWA shows the icon; no console 404 for the manifest icons or apple-touch-icon.

### 12. [frontend/a11y] Update `<html lang>` when the user switches EN ⇄ ZH
**Area:** a11y · **Difficulty:** ⭐⭐
**Why:** The app is fully bilingual with runtime switching, but `index.html` hardcodes `lang="en"` and nothing updates it (verified: only `document.documentElement.classList` is touched, never `.lang`). Screen readers pick the wrong pronunciation and search engines mis-tag the page language.
**Scope:** When the active language changes (see the i18n/language state in `src/store/useAppStore.ts` + `src/i18n`), set `document.documentElement.lang` to `"en"` or `"zh"`. A tiny effect/hook mirroring `useReducedMotionClass.ts` (which already toggles a root class) is the natural pattern. Add a small test asserting the attribute follows the language.
**Acceptance:** `document.documentElement.lang` reflects the selected language on load and on switch; test green; no hydration/console warnings.

### 13. [test] Unit test for the `useCoarsePointer` hook
**Area:** test · **Difficulty:** ⭐⭐
**Why:** Every hook in `src/hooks/__tests__` has coverage except `useCoarsePointer.ts` (26 lines) — an easy way to learn the repo's test setup and lock a small contract.
**Scope:** Add `src/hooks/__tests__/useCoarsePointer.test.ts` following the sibling pattern (e.g. `useIsMobile.test.ts`): mock `matchMedia`, assert the hook returns the coarse/fine result and responds to change events, and cleans up its listener on unmount.
**Acceptance:** New test green under `NODE_ENV=test npx vitest run src/hooks/__tests__/useCoarsePointer.test.ts --maxWorkers=2`; covers initial value + change + cleanup.

### 14. [dx] Add a repo-root `.editorconfig`
**Area:** dx · **Difficulty:** ⭐ (very easy)
**Why:** There's no `.editorconfig`, so contributors' editors don't share indentation, charset, or final-newline rules — a common source of noisy diffs for newcomers.
**Scope:** Add `.editorconfig` at the repo root matching the existing style (2-space indent, UTF-8, LF, trim trailing whitespace, final newline). Cross-check a few existing files (`web-app/src`, `backend/src`) so the rules match reality; note any Markdown exception (trailing-space line breaks).
**Acceptance:** `.editorconfig` present and consistent with current formatting; no reformatting churn introduced.

### 15. [docs] Add a repo-structure map to CONTRIBUTING
**Area:** docs · **Difficulty:** ⭐
**Why:** `.github/CONTRIBUTING.md` explains the workflow but never orients a newcomer to *where things live* (monorepo: `web-app/`, `backend/`, `packages/`, `docs/`, `deploy/`).
**Scope:** Add a short "Repository layout" section to `.github/CONTRIBUTING.md`: a compact tree/table of the top-level dirs and one line each on what lives there and where to add a frontend vs backend change. Keep it accurate to the current tree.
**Acceptance:** Section is accurate to the repo; links to key entry points resolve; ≤ ~15 lines.

---

## Notes for the maintainer
- Keep **8–12 open** at any time; refill as they're taken (launch-plan §4.2). **As of 2026-08-21, 10
  remain fileable (#4, #6, #8, #9, #10, #11, #12, #13, #14, #15)** — inside target after the #11–#15 refill.
- For each, respond to a first-time contributor's PR within ~48h even if only to acknowledge.
- Difficulty spread: **#9, #14, #15** are pure-DX/docs and safe for anyone; **#4, #6, #10, #11, #12** touch
  UI/markup with existing patterns to copy; **#13** is an isolated test; **#8** needs a maintainer to
  point at a safe endpoint first.
- **#11 is launch-critical** — social-preview tags should land *before* the PH/HN push, so file (or just
  ship) it early even if no contributor picks it up.
