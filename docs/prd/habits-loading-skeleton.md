# PRD — Habits page loading skeleton

**Phase:** 1 (Polish & UX) · closes the tracked remaining sub-item under **Loading skeletons** ("habits page still uses plain text").
**Type:** Frontend-only, presentational. No API / contract / backend change.

## Problem / User story
As a signed-in user opening the **Habits** page, I briefly see the *"No habits yet"* empty state before my habits load in — a jarring flash-of-empty-content. Unlike Today / Stats / Matrix (which show content-shaped skeletons on first paint, #93/#95), `useHabitsStore` has **no `loading` flag**, so `HabitsPage` cannot distinguish "still loading" from "genuinely empty" and defaults to the empty state.

## Acceptance criteria
1. `useHabitsStore` exposes a `loading: boolean` flag, initially `false`.
2. `load(userId)` sets `loading: true` while the fetch is in flight and `loading: false` once it settles — on **every** path (local/unauthenticated early-return, success, migration-failed surface, and error/catch).
3. `HabitsPage` renders a content-shaped `HabitsSkeleton` on first paint **only** when `loading && habits.length === 0` (no skeleton flash on background refetch when habits are already cached) — mirrors the MatrixPage guard.
4. `HabitsSkeleton` is a `SkeletonScreen` (`role=status` / `aria-busy`, single polite `app.loading` announcement) containing decorative (`aria-hidden`) habit-row bars; honors reduced-motion via the shared `Skeleton` primitive.
5. No new i18n keys (reuses `app.loading`); no hardcoded strings; token-driven styling.

## Out of scope
- Completed timeline (rendered within Today/Stats via the tasks store, which already has a `loading` flag + skeleton).
- Any endpoint/contract change → DFX/integration matrix unchanged (pure presentational, a11y covered by component tests — same precedent as #93/#95).

## Success metric
No empty-state flash for users with existing habits; a11y status semantics identical to the other page skeletons.
