# Lumo Task — documentation

Everything written about this project lives here, in one of seven areas. Only
the files GitHub or convention require stay at the repository root
(`README.md`, `README.zh.md`, `CHANGELOG.md`, `CLAUDE.md`, `LICENSE`, `NOTICE`)
or in `.github/` (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
`PR_REVIEW_CHECKLIST.md`).

| Area | What belongs there |
|------|--------------------|
| [`architecture/`](#architecture) | How the system is built and why |
| [`api/`](#api) | The generated API specification |
| [`product/`](#product) | What we're building and for whom |
| [`ops/`](#operations) | Running it in production |
| [`security/`](#security) | Threat model and review records |
| [`testing/`](#testing) | Test strategy and coverage |
| [`process/`](#process-and-business) · [`business/`](#process-and-business) | How we work; go-to-market |

---

## Architecture

- [**overview.md**](architecture/overview.md) — the mental model: stack, data
  flow, contract package, sync design. Start here.
- [**principles.md**](architecture/principles.md) — the engineering values the
  rest of the repo is an expression of.
- [**adr/**](architecture/adr/) — Architecture Decision Records. One file per
  irreversible-ish decision, with the alternatives considered.

| ADR | Decision |
|-----|----------|
| [0001](architecture/adr/0001-task-list-pagination.md) | Keyset pagination for task lists |
| [0002](architecture/adr/0002-per-user-database-sync.md) | Per-user database sync |
| [0003](architecture/adr/0003-server-authoritative-incremental-sync.md) | Server-authoritative incremental sync |
| [0004](architecture/adr/0004-single-tenant-environment-per-customer.md) | One environment per customer |
| [0005](architecture/adr/0005-countdown-lunar-calendar.md) | Lunar calendar for countdowns |
| [0006](architecture/adr/0006-unified-error-paradigm.md) | One error envelope everywhere |
| [0007](architecture/adr/0007-postgres-migration-path.md) | The Postgres migration path |

## API

The API is **contract-first and generated**. There is exactly one description of
the HTTP surface, and it is executable:

```
packages/contracts/src/registry.ts      ← the source of truth: every endpoint,
                                          its auth mode, request and response
        │                                 schemas (Zod)
        ├──► buildOpenApiDocument()  ──►  GET /docs/openapi.json   (served live)
        │                            ──►  docs/api/openapi.json    (committed)
        └──► api-registry.standards.test.ts
                 diffs the registry against the routes Hono actually mounts,
                 and fails in BOTH directions
```

- [**openapi.json**](api/openapi.json) — generated; **never hand-edit**.
  Regenerate with `npm run gen:openapi -w @lumo/contracts`.
- Browse it interactively at `/docs` on any running backend.

Changing an endpoint means: edit the schema in `@lumo/contracts` → edit its
registry entry → implement in the backend → consume in the frontend. In that
order. A pull request that changes an API without changing the contract first
fails `make ci`.

## Product

- [**prd.md**](product/prd.md) — the product requirements document.
- [**roadmap.md**](product/roadmap.md) — what's shipped, what's next.
- [**ui-design-spec.md**](product/ui-design-spec.md) — visual language, tokens,
  component behavior.
- [**specs/**](product/specs/) — per-feature specifications.
- [**proposals/**](product/proposals/) — designs still under discussion.

## Operations

- [**overview.md**](ops/overview.md) — environment variables, deployment
  topology, the operational surface as a whole.
- [**runbook.md**](ops/runbook.md) — what to do when it breaks.
- [**reliability-monitoring.md**](ops/reliability-monitoring.md) — health,
  readiness, metrics, alerting.
- [**logging.md**](ops/logging.md) — the structured-log format and how to trace
  a request end to end.
- [**database-backup.md**](ops/database-backup.md) — backup and restore.
- [**vps-deployment.md**](ops/vps-deployment.md) ·
  [**per-customer-deployment.md**](ops/per-customer-deployment.md) — the two
  deployment shapes.
- [**github-login-and-email-setup.md**](ops/github-login-and-email-setup.md) —
  configuring OAuth and transactional email.

## Security

- [**pre-launch-security-review.md**](security/pre-launch-security-review.md) —
  the standing review record.
- Reporting a vulnerability: [`.github/SECURITY.md`](../.github/SECURITY.md).

## Testing

- [**strategy.md**](testing/strategy.md) — the test pyramid and the "add a
  feature → add four layers" template. Read before writing tests.
- [**dfx-coverage-matrix.md**](testing/dfx-coverage-matrix.md) — the
  desktop/functional coverage matrix.
- [**qa/**](qa/) — dated validation records from specific releases.

## Process and business

- [**process/engineering-process.md**](process/engineering-process.md) — how a
  change moves from idea to production.
- [**business/commercial-plan-post-launch.md**](business/commercial-plan-post-launch.md)
  — the current plan. Written after launch and scoped to **capability** —
  reliability, capacity, observability, abuse — not billing. Calibrated to the
  VPS deployment that actually serves users. **Start here**; the two documents
  below predate launch.
- [**business/commercialization-readiness.md**](business/commercialization-readiness.md)
  — the pre-launch gap assessment. Its monetization section (§2) is still the
  reference for the billing work.
- [**business/go-to-market.md**](business/go-to-market.md) — channel plan, scoped
  to the free beta.
- [**business/**](business/) — plus `legal/`, `marketing/`, and `planning/` material.

---

## Adding a document

Put it in the area that matches its **audience**, not its author: an operator
reaching for a runbook at 3am should not have to guess. If a document is a
record of a moment (a QA run, a dated review), date it in the filename. If it is
a decision, it is an ADR.
