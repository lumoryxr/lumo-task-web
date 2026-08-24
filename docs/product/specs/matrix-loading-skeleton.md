# PRD — Loading skeleton for the Eisenhower Matrix page (#95)

## Problem / user story
As a user opening the **Matrix** page while tasks are still loading, I currently
see an empty 2×2 grid (or a flash of "empty" state) until data arrives, which
reads as "you have no tasks". Today and Stats already show a loading skeleton
(#81/#86); Matrix should match for a consistent, non-jumpy first paint.

## Scope
Add a `MatrixSkeleton` that mirrors the 2×2 quadrant layout and show it on the
Matrix page while the tasks store is loading and the cache is still empty —
exactly the gate Today uses (`loading && tasks.length === 0`).

## Acceptance criteria
- **AC1** `MatrixSkeleton` renders a single polite, busy status region
  (`role=status`, `aria-busy=true`, `aria-live=polite`) so screen readers
  announce one "Loading…", with the shimmer bars decorative (`aria-hidden`).
  (Consistent with `TaskListSkeleton`/`StatsSkeleton`.)
- **AC2** It renders **4 quadrant placeholders** (one per Eisenhower quadrant),
  each with a header bar + a couple of card rows.
- **AC3** `MatrixPage` shows `<MatrixSkeleton/>` when `loading && tasks.length === 0`,
  and the real grid otherwise (no skeleton once any task is cached, no skeleton
  when loading has finished).
- **AC4** No raw i18n keys, reduced-motion respected (inherited from `Skeleton`),
  existing Matrix UI cases (TC28–TC34) still pass.

## Out of scope
- Calendar view skeleton (Matrix has a calendar sub-view; the loading gate
  returns before view selection, matching Today's behaviour).
