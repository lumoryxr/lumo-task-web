# Claude Code — Project Instructions

This file gives Claude Code shared rules whenever it opens this project.

## What is this

Lumo Task is a React + TypeScript focus + Eisenhower matrix app. The frontend
(`src/api/client.ts`) talks to the real Hono + SQLite backend in `backend/`
over REST; configure the base URL with `VITE_API_BASE`. API request/response
shapes are defined once in `@lumo/contracts` and shared by both sides.

## Architecture rules

- **Contract-First (non-negotiable).** API shapes live in `@lumo/contracts`
  (`packages/contracts`) as Zod schemas — the single source of truth shared
  with the backend. `src/types/task.ts` re-exports the inferred `Task`,
  `Quadrant`, `LocalizedString`, etc. from there. To change an API field,
  edit the contract schema FIRST, then the backend, then the frontend. Never
  hand-write a type in `src/types/*` that mirrors a backend response.
- **Types live in `src/types/task.ts`.** Don't redefine `Task`, `User`,
  etc. — import from there (which re-exports from `@lumo/contracts`). Types
  not yet migrated to the contract (User, AppSettings, Habit, …) are still
  defined locally for now.
- **All data goes through `src/api/client.ts`.** Components never touch
  `localStorage`, never import seed data directly. To add an endpoint,
  add a function to the `api` object.
- **UI components never call the API directly.** They call store
  actions (`useTasksStore.*`); the store calls the API. This keeps
  optimistic updates + error handling in one place.
- **CSS tokens > arbitrary hex.** Use Tailwind semantic classes
  (`bg-surface`, `text-text-primary`) or `var(--accent-primary)` —
  never inline a hex unless it's truly one-off.
- **Locale-aware strings** go in `src/i18n/strings.ts` with both `en`
  and `zh` entries. Use `useT()` to look them up. For string data on
  domain objects (task titles, descriptions), the field is a
  `LocalizedString` — resolve with `useLocaleString()`.

## Layout invariants

- The app fills the viewport. No window chrome, no max-width container
  around the shell, no card-like background. (Per design feedback —
  web/Windows-desktop pattern.)
- Modals are dismissable via a real **close button (X)** in the header,
  not a keyboard-hint chip. `Esc` is a convenience but never the only
  affordance.
- Sidebar is 220px fixed; topbar is 56px fixed; Focus page hides the
  topbar to give the timer the full canvas.

## When adding a feature

1. Add types to `src/types/task.ts` if the data shape grows.
2. Update seed data in `src/mocks/tasks.ts` so the feature has
   something to render.
3. Add an API method in `src/api/client.ts`.
4. Expose it as a store action in `src/store/useTasksStore.ts`.
5. Use it from the page/component.
6. Add i18n strings to `src/i18n/strings.ts` (both locales).

## Commands

```bash
npm run dev        # dev server on :5173
npm run build      # type-check + production bundle
npm run typecheck  # tsc --noEmit only
```

## What's already wired up

- ✅ Full-viewport web/Windows-desktop layout (sidebar + topbar + content)
- ✅ Mock API + localStorage persistence
- ✅ Today / Matrix / Focus / Settings / Stats pages
- ✅ Drag-and-drop between Matrix quadrants (HTML5 DnD, no extra deps)
- ✅ AI classify modal — review Lumo's per-task suggestions, override any,
  apply all in one go
- ✅ Onboarding flow (welcome → language → accent → density → done) with
  "Replay onboarding" in Settings
- ✅ Bilingual (en / zh) with locale-aware task strings
- ✅ Accent theming (4 swatches) wired to CSS vars
- ✅ Calendar week view with drag-to-set-due-date
- ✅ Pomodoro Web Worker (survives tab switches, notifies on completion)
- ✅ AI semantic classification (LLM quadrant + reason, heuristic fallback)
- ✅ Shareable weekly stats card (PNG export via html2canvas, Web Share API)
- ✅ PWA manifest + service worker (installable, offline shell)
- ✅ Mobile layout (bottom tab bar, responsive Matrix/Today/ConvictionCard)
- ✅ Lumo Dog celebration moments (Q1 complete, all-done banner, streak milestones)

## Test coverage

- Unit tests (Vitest + RTL): components, hooks, utils, store actions
- Standards guards (`src/test/standards/`): i18n en/zh parity, no raw hex on
  themeable surfaces (`css-tokens`), app root stays wrapped in `ErrorBoundary`
- E2E tests (Playwright): auth flow, task CRUD, focus session, stats
- `npm test` (Vitest) runs in CI and via `make ci`. See root `docs/testing/strategy.md` for
  the full cross-package test pyramid and how to add tests for a new feature.
