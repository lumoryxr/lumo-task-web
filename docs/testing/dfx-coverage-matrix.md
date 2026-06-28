# DFX (Design-for-X) Coverage Matrix

**DFX = Design for X** — the cross-cutting quality attributes a production system
must hold beyond "the feature works": security, robustness, recoverability,
observability, scalability, interoperability. Where the happy-path integration
suite proves *features* work end-to-end, the DFX suite proves the system *holds
its quality attributes* under hostile, malformed, and boundary input — the
failure modes that don't show up in feature tests but bite in production.

## Where it runs

| Layer | File | When |
|---|---|---|
| Integration (real HTTP + real SQLite) | `backend/src/test/dfx.integration.test.ts` | Daily `Integration Regression` workflow + `make test-integration-dfx` |
| Fast per-PR guard (in-process) | `backend/src/test/api/error-handling.test.ts` | Every PR (backend API suite) |

The daily workflow (`.github/workflows/integration-regression.yml`) runs against
a **fresh, ephemeral environment** (brand-new temp SQLite, no production data) so
results are reproducible and never touch live infra. It is **never** triggered on
push/PR.

## Coverage by dimension

| DFX dimension | What it guarantees | Covered cases (in `dfx.integration.test.ts`) |
|---|---|---|
| **Design for Security** | No unauthorized access, no cross-tenant leakage, no injection, no weak credentials | missing token → 401; garbage/malformed bearer → 401; cross-tenant read/patch/delete → 404 (no leak); **cross-tenant PATCH/DELETE + list scoping on every user-scoped CRUD resource — `countdowns` / `habits` / `people` (owner row survives, attacker list excludes it)**; weak password rejected at registration; SQL-injection-shaped input stored as literal data (table survives) |
| **Design for Robustness** | Malformed / wrong-typed / missing input degrades to 4xx, never a 5xx crash | malformed JSON body → 400 `INVALID_JSON` (on `tasks` **and** `people` / `countdowns` / `habits` — proves a global, not per-route, envelope); missing required field → 400; wrong field type → 400; out-of-enum value → 400; unknown route → 404 |
| **Design for Recoverability** | A bad request never poisons the server; the next request still works | invalid pagination cursor → 400 `INVALID_CURSOR`; burst of bad requests followed by a healthy request → 200; operation on non-existent id → 404 |
| **Design for Observability** | Health/readiness are meaningful; every error has a consistent, machine-readable shape | `/health` → 200 `{ok:true}` (liveness); `/ready` reflects a real DB probe (readiness); business errors all carry `{ error: { code, message } }` |
| **Design for Scalability** | List responses are always bounded; pagination is correct under volume | default page bounded (≤ 50) with `nextCursor`; over-max `limit` (>200) rejected → 400 (no unbounded read); cursor paging walks every row exactly once — no dupes, no omissions |
| **Design for Interoperability** | Stable wire contract clients can rely on | JSON `Content-Type`; `DELETE` → 204; successful create → 201 with a server-assigned id |

## Bugs this suite has already caught

- **Malformed JSON body → 500 instead of 400** (fixed by honoring Hono's
  `HTTPException` in `app.onError`, PR for issue: daily-integration-dfx). A
  malformed payload could masquerade as a server outage / 5xx alert.

## Coverage-gap audits

- **2026-06-28 — tenant-isolation breadth.** Every DFX dimension was previously
  exercised only against `/v1/tasks`, so an IDOR or 5xx regression in any other
  user-scoped resource would have shipped green. Added cross-tenant
  PATCH/DELETE + list-scoping cases for `countdowns`, `habits`, and `people`,
  plus a global malformed-JSON envelope check across those routes. All three
  resources already scoped correctly (`WHERE user_id = …`) — the gap was in the
  *tests*, not the code; the suite now locks that guarantee in.

## Auto-replenishment — keeping coverage honest as the product grows

This matrix is a contract, not a snapshot. Two mechanisms keep it current:

1. **Every feature PR must extend it.** A PR that adds or changes an endpoint
   adds the matching integration + DFX cases in the same PR. This is part of the
   engineering discipline (QA gate), not an afterthought.
2. **Periodic coverage-gap audit.** The recurring engineering loop diffs the live
   API surface (routes) against the dimensions covered here and opens a PR to fill
   any gap — new endpoint with no DFX row, new error path with no robustness case,
   new list endpoint with no scalability case.

When a dimension is intentionally not covered for an endpoint, say so explicitly
here rather than leaving a silent hole.
