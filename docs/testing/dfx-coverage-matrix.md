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
| **Design for Security** | No unauthorized access, no cross-tenant leakage, no injection, no weak credentials | missing token → 401; garbage/malformed bearer → 401; cross-tenant read/patch/delete → 404 (no leak); weak password rejected at registration; SQL-injection-shaped input stored as literal data (table survives). **Tenant isolation now exercised across all user-scoped CRUD resources** — `tasks` **+ `people` / `countdowns` / `habits`**: attacker PATCH/DELETE of another tenant's row → 404 (owner's row survives & unmutated); attacker's list never contains the owner's row (#158) |
| **Design for Robustness** | Malformed / wrong-typed / missing input degrades to 4xx, never a 5xx crash | malformed JSON body → 400 `INVALID_JSON` (proven a **global** handler — exercised on `tasks` + `people` / `countdowns` / `habits`, #158); missing required field → 400; wrong field type → 400; out-of-enum value → 400; unknown route → 404 |
| **Design for Recoverability** | A bad request never poisons the server; the next request still works | invalid pagination cursor → 400 `INVALID_CURSOR`; burst of bad requests followed by a healthy request → 200; operation on non-existent id → 404 |
| **Design for Observability** | Health/readiness are meaningful; every error has a consistent, machine-readable shape | `/health` → 200 `{ok:true}` (liveness); `/ready` reflects a real DB probe (readiness); business errors all carry `{ error: { code, message } }` |
| **Design for Scalability** | List responses are always bounded; pagination is correct under volume | default page bounded (≤ 50) with `nextCursor`; over-max `limit` (>200) rejected → 400 (no unbounded read); cursor paging walks every row exactly once — no dupes, no omissions |
| **Design for Interoperability** | Stable wire contract clients can rely on | JSON `Content-Type`; `DELETE` → 204; successful create → 201 with a server-assigned id |

## Bugs this suite has already caught

- **Malformed JSON body → 500 instead of 400** (fixed by honoring Hono's
  `HTTPException` in `app.onError`, PR for issue: daily-integration-dfx). A
  malformed payload could masquerade as a server outage / 5xx alert.

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

## Coverage-gap audit log

- **2026-06-28 (#158)** — Audit found tenant-isolation / malformed-body DFX cases
  existed **only for `/v1/tasks`**, while the matrix advertised them as system-wide.
  Closed by parametrizing the isolation + `INVALID_JSON` cases over `people`,
  `countdowns`, and `habits` (12 new cases). All three were verified to already
  scope correctly — **the gap was in the tests, not the code** (no production change).
