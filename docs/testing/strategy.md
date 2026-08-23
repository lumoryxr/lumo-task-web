# Testing guide

How testing is organized in this repo, and **how to add tests when you add a
feature**. The goal is that growth is cheap: a new endpoint or component should
slot into an existing layer using shared helpers, never a bespoke setup.

## The pyramid

```
                 ┌─────────────────────────┐
                 │  E2E · Playwright        │  web-app/tests/         critical user flows
                 ├─────────────────────────┤
                 │  Integration · real HTTP │  backend/src/test/integration/
                 ├─────────────────────────┤
        ╭────────┤  Standards guards        │  backend/.../standards/ · web-app/.../standards/
        │ cross  ├─────────────────────────┤
        │ cutting│  Security suite          │  backend/src/test/security/
        ╰────────┤  Contract conformance    │  XxxWireSchema.parse(response) in api/ suites
                 ├─────────────────────────┤
                 │  Unit · per domain       │  backend/src/test/api/ · web-app/src/**/__tests__/
                 ├─────────────────────────┤
                 │  Contract schema units   │  packages/contracts/src/__tests__/
                 └─────────────────────────┘
```

| Layer | Tool | Location | Run |
|-------|------|----------|-----|
| Contract schema | node:test | `packages/contracts/src/__tests__/` | `npm test -w @lumo/contracts` |
| Backend unit + contract conformance | node:test | `backend/src/test/api/<domain>.test.ts` | `cd backend && npm test` |
| Backend security | node:test | `backend/src/test/security/*.security.test.ts` | `cd backend && npm run test:security` |
| Backend standards | node:test | `backend/src/test/standards/*.standards.test.ts` | `cd backend && npm run test:standards` |
| Backend integration | node:test | `backend/src/test/integration/` | `cd backend && npm run test:integration` |
| Frontend unit + standards | Vitest + RTL | `web-app/src/**/__tests__/`, `web-app/src/test/standards/` | `cd web-app && npm test` |
| E2E | Playwright | `web-app/tests/` | `cd web-app && npx playwright test` |

Everything except E2E is gated by `make ci` (which mirrors GitHub Actions:
contracts → backend → frontend). Backend unit coverage is gated at **≥80% lines**
via `npm run test:coverage`.

### Test environments (backend)

| File | Used by | Notes |
|------|---------|-------|
| `backend/src/test/.env.test` | `npm test` / `:security` / `:standards` | in-memory SQLite; rate limiter disabled |
| `backend/src/test/.env.integration` | `npm run test:integration` | file-backed SQLite |

Node's test runner isolates each file in its own process, so every backend test
file gets a **fresh in-memory database** — there is no shared state or ordering
between files, and any file can be run alone.

## Contract-First (start here for anything touching an API)

The single source of truth for every request/response shape is the Zod schema in
`@lumo/contracts`. To change an API you edit the contract **first**, then the
backend, then the frontend. This is enforced, not advisory:

- `standards/contract-first.standards.test.ts` fails if a migrated route defines
  an inline JSON body schema instead of importing from `@lumo/contracts`.
- `standards/error-shape.standards.test.ts` fails if any error response drifts
  from the `ApiError` envelope.
- Each migrated domain's api suite parses real responses with its wire schema.

## Adding a feature — the four layers (TDD: Red → Green → Refactor)

Say you're adding `/v1/widgets`.

1. **Contract first.** Add `packages/contracts/src/widget.ts` with
   `WidgetCreateBodySchema`, `WidgetUpdateBodySchema`, `WidgetWireSchema` and the
   inferred types; export from `index.ts`; register in `openapi.ts`. Add
   `__tests__/widget.test.ts` (valid parses, invalid rejected) — run it red, then
   green.
2. **Backend.** Implement `routes/widgets.ts`, validating with
   `zValidator("json", WidgetCreateBodySchema)` and typing the response as
   `WidgetWire`. Add `backend/src/test/api/widgets.test.ts` using the shared
   helpers (`req`, `setupDb`, `signInDemo`, a `seedWidget` factory) — cover
   happy-path / 400 / 404 / 401, and `expectConforms(WidgetWireSchema, body)`.
3. **Security.** Add a row to `RESOURCES` in `security/authz.security.test.ts`
   for the IDOR sweep. If the endpoint is sensitive, add a rate-limit case.
4. **Frontend.** Re-export `Widget` from `@lumo/contracts` in
   `web-app/src/types/`, add the client method + store action, and a
   `__tests__/` component test. Keep colors on tokens (the css-tokens guard) and
   the root wrapped in `ErrorBoundary` (the error-boundary guard).

Every endpoint owes, at minimum: **happy-path, validation (400), not-found
(404) where applicable, auth (401)**, plus **contract conformance**.

See `backend/src/test/README.md` for the backend harness specifics (helpers,
factories, the IDOR table).

## Quick commands

```bash
make ci                       # full local gate (contracts + backend + frontend)
cd backend  && npm test       # unit + contract conformance
cd backend  && npm run test:security
cd backend  && npm run test:standards
cd backend  && npm run test:coverage    # unit + ≥80% lines gate
cd web-app  && npm test       # Vitest unit + standards
npm test -w @lumo/contracts   # contract schema units
```
