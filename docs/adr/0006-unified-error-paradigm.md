# ADR 0006 — Unified error paradigm (frontend + backend)

- Status: **Accepted**
- Date: 2026-06-27
- Requirement: Jalen (2026-06-27). Every error — frontend and backend — must
  follow one paradigm; messages must be **complete and specific** (surface the
  real, detailed reason); and all error display must go through a single shared
  path going forward. Decision: error **detail stays English** (maximize
  diagnostic signal over translation); the toast **title** stays localized.

## Context

The pieces were mostly there but not unified:

- **Backend** already emitted `{ error: { code, message } }` via a central
  `httpError()` helper for ~66 business-error sites, plus `app.onError`. But
  **schema-validation failures bypassed it**: routes imported `@hono/zod-validator`
  directly, whose default failure handler returns its OWN shape
  (`{ success: false, error: <ZodError> }`). The frontend could not read that, so
  a bad field collapsed to a useless "HTTP 400" — the original /register bug. Error
  **codes were scattered string literals** with no registry (typos invisible).
- **Frontend** had a decent `toast.error(title, detail)` and even attached
  `error.code`, but: the detail was often omitted or English-only with no system,
  non-standard bodies degraded to "HTTP 400", the attached `code`/fields were never
  used, and some stores swallowed errors silently. No single presentation entry.

## Decision

**Backend**
1. **Central error-code registry** in `@lumo/contracts` (`ERROR_CODES` as-const map +
   `ErrorCode` union). `httpError(c, status, code, message, fields?)` constrains
   `code` to the registry — a typo fails the type-check.
2. **`validate()` wrapper** (`backend/src/lib/validate.ts`) is the only place allowed
   to call `zValidator`. Its failure hook normalizes every validation error into the
   canonical envelope with code `VALIDATION_ERROR`, a **complete English message that
   names each offending field and why**, and a structured `fields: [{path,message}]`.
3. Envelope gains optional `fields` (`ApiErrorSchema` in contracts).

**Frontend**
4. **`ApiError` class** (`src/api/ApiError.ts`) — the single thrown type, carrying
   `code`, `status`, `message`, `fields`. The client throws it for every non-2xx.
5. **`presentError(err, titleKey?)`** (`src/lib/presentError.ts`) — the single entry
   for surfacing an error: localized **title** + raw English **detail**. Plus
   `fieldErrorsOf(err)` → `{ path: message }` for inline form messages, and
   `detailOf(err)` for the specific reason.

**Guards**
6. Standards test forbids any route importing `@hono/zod-validator` directly (must use
   `validate()`). A frontend guard forbidding raw `toast.error` outside `presentError`
   lands once all stores are migrated (final batch).

## Rollout (phased — foundation first, then migrate ~90 sites)

- **Foundation (this ADR / PR):** registry + `validate()` + route migration + envelope
  `fields`; frontend `ApiError` + `presentError`/`fieldErrorsOf`; migrate the auth
  store + Login/Register to inline field errors as the end-to-end proof (fixes the
  original /register bug properly). Backend+frontend tests; backend zValidator guard.
- **Batch 2:** migrate remaining stores (tasks/habits/people/countdown/ai/calendar/
  notification — incl. the silent `useNotificationStore` catch) and ChangePassword to
  `presentError`.
- **Batch 3:** migrate remaining component catch sites; add the frontend
  `toast.error`-outside-`presentError` guard; localize the `ErrorBoundary` shell.

## Consequences

- Single envelope + single error vocabulary + single display entry; validation
  failures now tell the user **which field and why**, inline.
- Cost: every route routes validation through one wrapper; new error codes must be
  registered (intended — that's the type-safety). Detail is English by decision, so a
  zh user sees a localized title + English specifics.

Supersedes nothing; complements the contract-first rule.
