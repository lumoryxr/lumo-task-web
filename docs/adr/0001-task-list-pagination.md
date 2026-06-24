# ADR 0001 — Task list pagination (`GET /v1/tasks`)

- Status: Accepted
- Date: 2026-06-24
- Requirement: #47 (PRD) · Increment 1 of list-pagination

## Context
`GET /v1/tasks` returns **all** of a user's incomplete tasks as a bare JSON array,
with no bound. For a heavy user this is a multi-MB response that the server must
materialize and Zod-validate row-by-row — a latency / memory / OOM risk on the
shared cloud Turso instance (production-readiness P1). We need bounded,
paginated reads. Jalen's API standard: **use query parameters to limit the
count and to page.**

## Decision

### 1. Request — query parameters (per the standard)
- `?limit=` — integer 1..200, **default 50**. Always applied, so an unbounded
  response is impossible (AC-4).
- `?cursor=` — opaque keyset token (base64url of the last row's `created_at|id`).
- `?q=` — existing search; composes with pagination (AC-6).

### 2. Pagination strategy — keyset (cursor), NOT offset
Offset pagination re-scans `OFFSET n` rows (slow at depth) and drifts under
concurrent inserts. Keyset seeks directly via the existing index
`(user_id, completed, created_at)`, is stable under inserts, and stays O(limit).
Tie-break by `id` so ordering is total and deterministic (AC-3).

Query shape (bound params; fetch `limit+1` to detect a next page):
```sql
SELECT * FROM tasks
 WHERE user_id = :uid AND completed = 0
   AND (created_at > :ca OR (created_at = :ca AND id > :id))   -- only when cursor present
 ORDER BY created_at ASC, id ASC
 LIMIT :limitPlusOne
```
(Expanded row-comparison form for SQLite-version portability.) No full scan (AC-8).

### 3. Response — standard envelope (breaking change, absorbed by the client)
```jsonc
{ "items": TaskWire[], "nextCursor": string | null }   // null ⇒ last page (AC-7)
```
Bare-array → envelope is breaking for any raw consumer. There are **two**
first-party consumers, both updated in the same PR:
1. the web-app (`api.listTasks`), and
2. the backend AI tools (`lib/ai-tools.ts`), which call `GET /tasks` over the
   loopback API in `list_tasks` / `get_focus_stats` / `search_tasks` /
   `generate_today_plan` — these now page the envelope via a `listAllTasks()`
   helper. (Caught by the pagination code review, not the initial draft — hence
   this correction.)

### 4. Frontend blast-radius — absorb inside `listTasks()`
The web-app's matrix / today / week views operate on the **full** incomplete-task
set client-side (`useTasksStore.ts`). Rather than redesign the UI for server
pagination now, `api.listTasks()` keeps its signature (`Promise<Task[]>`) and
**loops cursor pages internally** until `nextCursor === null`, assembling the
full list. Result:
- The **server** is protected: every request is ≤200 rows (bounded query,
  bounded serialization, no lock-holding mega-scan) — the actual P1 win.
- The **rest of the frontend is unchanged** (store/components untouched).
- A safety cap (e.g. 50 pages) prevents a pathological infinite loop.

Server-driven infinite-scroll UI is a deliberate **future increment**, not this one.

### 5. Cursor validity (AC-5)
Invalid / unparseable / wrong-shape cursor → `400` with a generic message
(no information leak). Cursors are not signed; they only encode a sort position,
and the query is always re-scoped by the authenticated `user_id`, so a cursor
from user A cannot read user B's rows (AC-7).

## Consequences
- ✅ Bounded server cost per request; indexed keyset; stable ordering.
- ✅ Standard query-param API; envelope is extensible (e.g. add `total` later).
- ➖ Client still ends up with all of its own tasks (acceptable: one user's data,
  in their own browser) until the future infinite-scroll increment.
- ➖ Breaking response shape — mitigated by updating the sole consumer in-PR.

## Alternatives rejected
- **Offset/limit**: simplest, but deep-offset slowness + insert drift; fails the
  scalability goal.
- **Header `X-Next-Cursor` + bare array (non-breaking)**: avoids client changes
  but is a non-standard place for pagination metadata; Jalen asked for the
  standard query-param interface, and the envelope is the standard response.
