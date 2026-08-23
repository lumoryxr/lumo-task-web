# Claude Code — Project-Wide Engineering Standards

This file applies to every session in this repository. All feature work, bug fixes,
refactors, and reviews must follow the ECC quality standards below.

---

## Code Review Policy

**After completing a code review, immediately fix all identified issues directly in the code
without waiting for user confirmation.** Report findings AND apply fixes in the same step.

---

## Mandatory Engineering Process

### Before implementing any feature or fix

1. **Select the relevant ECC skills** and load them before writing code:
   - New UI component → `/ecc:frontend-patterns`
   - New API endpoint → `/ecc:api-design` + `/ecc:backend-patterns`
   - Bug fix with side effects → `/ecc:error-handling`
   - Any new code → `/ecc:coding-standards`
   - Security-sensitive change → `/ecc:security-review`

2. **Follow TDD (Red → Green → Refactor)**:
   - Write the test first (it must FAIL initially)
   - Write the minimum implementation to make it pass
   - Refactor without breaking tests
   - Reference `/ecc:tdd-workflow` for guidance

3. **Type-check before declaring done**:
   ```bash
   cd backend && npm run typecheck
   cd web-app && npm run typecheck
   ```

4. **Run tests before every commit**:
   ```bash
   cd backend && npm test
   cd web-app && npm test
   ```

---

## Architecture Rules (enforced every session)

### API Contract — Contract-First (non-negotiable)
- **The single source of truth for every API request/response shape is the Zod
  schema in `packages/contracts` (`@lumo/contracts`).** Any change that touches an
  API — adding/removing/renaming an endpoint, changing a request or response field,
  changing an enum or a validation rule — **MUST start by editing the contract**,
  then flow to the backend implementation and the frontend consumer. In that order.
- **Never** redefine an API shape anywhere else: no inline request/response Zod in a
  route, no hand-written domain type in `web-app/src/types/*` that mirrors a backend
  shape, no hardcoded schema in the OpenAPI doc. Import from `@lumo/contracts` and,
  on the frontend, re-export the inferred type.
- Backend route handlers validate with the contract schema (`zValidator(...)`) and
  type their responses against the contract's wire type (e.g. `TaskWire`).
- **OpenAPI is generated from the contract**, never hand-edited. The backend serves
  the live spec at `GET /docs/openapi.json`; `docs/api/openapi.json` is written by
  `npm run gen:openapi -w @lumo/contracts` and both come from the same builder. Do
  not edit generated specs by hand.
- This is enforced, not advisory: a **contract-conformance test** parses real backend
  responses with the contract schema, and the frontend infers its types from it — so
  any drift fails `make ci`. A PR that changes an API without changing the contract
  first is non-compliant.
- Migrating a not-yet-migrated domain into `@lumo/contracts`? Follow the Task domain
  as the reference pattern (schema → backend → frontend → conformance test → OpenAPI).

### Frontend (`web-app/`)
- Types live in `src/types/`. Never redefine `Task`, `User`, etc.
- Components → Store actions → `src/api/client.ts` → backend. No shortcuts.
- All user-facing strings go in `src/i18n/strings.ts` (both `en` and `zh`). Use `useT()`.
- CSS tokens only: `bg-surface`, `text-text-primary`, `var(--accent-primary)`. No raw hex.
- New components get a `__tests__/` test file (Vitest + @testing-library/react).
- `useEffect` dependencies must be complete — never `// eslint-disable` stale closure warnings; use `useRef` instead.
- Loading/busy states are required for all async user actions (disable button, show spinner).
- Wrap the app root in `ErrorBoundary` — never let a render error produce a blank screen.

### Backend (`backend/`)
- All route errors use `httpError(c, status, CODE, message)` from `src/lib/errors.ts`.
  Response shape: `{ error: { code: string, message: string } }`.
- Global `app.onError()` catches unhandled exceptions — no silent 500s.
- Async route handlers must be wrapped in try/catch.
- API keys are NEVER returned from any endpoint — only `hasKey: boolean`.
- High-risk operations (delete account, change password) are NEVER exposed as AI tools.
- Pet/AI tools go through the REST API, never direct DB access.
- Feature branches only. Never push directly to `main`.

### Security (non-negotiable)
- JWT tokens stored in localStorage — acceptable for this Electron/web app.
- All inputs validated with Zod at the route boundary.
- SQL uses parameterized queries (`:name` style) — no string interpolation.
- Rate-limit sensitive endpoints (auth, AI) at the middleware level.

---

## Test Infrastructure

| Layer | Tool | Run command |
|-------|------|-------------|
| Contract schema | Node `--test` | `npm test -w @lumo/contracts` |
| Backend API + contract conformance | Node `--test` | `cd backend && npm test` |
| Backend security (authn/authz/input/secrets/rate-limit) | Node `--test` | `cd backend && npm run test:security` |
| Backend standards (error-shape, contract-first) | Node `--test` | `cd backend && npm run test:standards` |
| Backend integration (real HTTP) | Node `--test` | `cd backend && npm run test:integration` |
| Frontend unit + standards (css-tokens, error-boundary) | Vitest + RTL | `cd web-app && npm test` |
| E2E | Playwright | `cd web-app && npx playwright test` |

Coverage targets: backend ≥ 80% lines (gated by `npm run test:coverage`),
frontend new components 100% of public behavior. `make ci` runs every layer
above except E2E. **See `TESTING.md` for the full pyramid and the "add a feature
→ add four layers" template.**

---

## ECC Skill Reference

Skills are provided via the `ecc` plugin and invokable as `/ecc:skill-name`:

| Skill | When to invoke |
|-------|---------------|
| `/ecc:coding-standards` | Any new file or significant refactor |
| `/ecc:error-handling` | Exception paths, retries, fallbacks |
| `/ecc:frontend-patterns` | React components, hooks, state |
| `/ecc:api-design` | New REST endpoints, request/response schema |
| `/ecc:backend-patterns` | Database queries, middleware, auth |
| `/ecc:tdd-workflow` | All feature work (write tests first) |
| `/ecc:e2e-testing` | Critical user flows, Playwright scenarios |
| `/ecc:security-review` | Auth changes, input handling, secrets |

**If in doubt, apply `/ecc:coding-standards` + the domain-specific skill.**
