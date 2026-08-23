# Lumo Task — Product Requirements Document

> **Version:** 2.1 — 2026-05-18
> **Status:** Active (core feature set complete; backend integration pending)
> **Audience:** Engineers, designers, and stakeholders building Lumo Task.

---

## 1. Product Vision

**Lumo Task** is a personal focus and priority management tool built around the **Eisenhower Matrix**. It helps knowledge workers answer the daily question: *"What should I actually work on right now?"*

The product sits at the intersection of a task manager and a focus coach:
- Classifies tasks by urgency and importance (Eisenhower quadrants Q1–Q4).
- Surfaces a daily primary task recommendation backed by lightweight AI reasoning.
- Runs a Pomodoro-style focus timer to protect deep work time.
- Supports **team awareness** — tasks can be assigned to named people tracked within the app.
- Works entirely **offline-first**, with optional cloud sync as a future upgrade path.

### Positioning

| | Lumo Task | To-do apps (Things, Todoist) | Calendar apps |
|---|---|---|---|
| Prioritization model | Eisenhower Matrix | Tag/list | Time blocks |
| AI involvement | Classify + recommend | None or tag-suggest | None |
| Focus mode | Integrated Pomodoro | External tool | External tool |
| Assignee tracking | Named person + avatar | Limited | None |
| Primary device | Desktop (web + Tauri) | Mobile-first | All |

### Design Pillars
1. **Clarity over completeness** — show the one most important task, not everything.
2. **Local-first** — fully functional with no account and no network.
3. **Keyboard-friendly** — power users never leave the keyboard for common flows.
4. **Opinionated defaults, flexible configuration** — sensible settings out of the box.
5. **Bilingual by design** — English and Simplified Chinese as equal first-class languages.

---

## 2. User Personas

### Primary: The Deep Worker
- Knowledge worker (engineer, writer, researcher, student).
- Has 10–50 active tasks at any time.
- Struggles with prioritization and distraction.
- Works primarily on desktop (Windows or macOS).
- Goal: spend the first hour of the day on the highest-leverage work.

### Secondary: The Organized Planner
- Manager or self-employed professional.
- Uses Eisenhower Matrix deliberately (familiar with the methodology).
- Wants a digital version that doesn't require daily re-sorting.
- **Delegates tasks to others** and wants to track ownership at a glance.
- Goal: maintain a clean, classified backlog with minimal overhead.

---

## 3. Feature Specifications

### 3.1 Today Page

**Purpose:** Answer "what should I work on today?" in one screen.

#### Hero Card (AI Recommendation)
- Lumo AI selects the top task based on quadrant, due date, and conviction score.
- Displays: task title, quadrant chip, confidence bar (0–100%), AI reasoning text (1–2 sentences).
- "Not now" section lists deprioritized tasks with brief reasons.
- User can **Start focus** (goes to Focus page) or **Skip** (removes from today's recommendation).

#### Today Task List
- Tasks with `today: true`, ordered by quadrant priority (Q1 → Q2 → Q3 → Q4).
- Each row layout (left → right): **complete circle** | quadrant dot | title + meta | *(hover: Start Focus icon · Edit icon)* | assignee avatar | quadrant chip.
- **Left circle** — click directly completes the task (no intermediate popup). Hover shows a green ✓ checkmark preview.
- **Center content area** — click opens the **Task Detail Modal** (see below).
- **Right hover actions** — revealed on row hover: `→` Start Focus (navigates to Focus page), `✏` Edit (opens Edit modal). Assignee avatar and quadrant chip are always visible.
- Completed tasks appear in a "Completed today" timeline at the bottom with timestamps and a reopen button.

#### Task Detail Modal
- Opens when clicking a task row's content area.
- Header: 3px quadrant accent color bar, quadrant code + label, full task title, X close button.
- Body grid: Due date, Estimate, Pomodoro progress (n/total), Assignee (with avatar), Next step text (when set by AI).
- **No "Today" toggle** — today assignment is managed at creation or via AI recommendation; removing from today is out of scope in v1.
- Footer: **Start Focus** (primary, navigates to `/focus`), **Complete** (secondary, marks done + closes), **Edit** (ghost, right side, opens Edit modal).
- Dismissible via X button, backdrop click, or `Escape`.

#### Task Edit Modal
- Full CRUD form for existing tasks.
- Fields: title (free text), quadrant (2×2 card selector), due date (date picker), duration (stepper), assignee chip picker.
- Footer: **Delete task** (left, confirm-to-delete — requires two clicks), **Cancel**, **Save changes**.
- `Cmd/Ctrl+Enter` saves; `Escape` closes.

#### Quick Create (Modal)
- Triggered via "+" button in topbar or keyboard shortcut.
- **Centered modal** with semi-transparent backdrop blur.
- Fields:
  - **Task title** — free text, auto-focused.
  - **Quadrant** — 2×2 grid of cards (Q1/Q2/Q3/Q4), each with dot, code, label, description.
  - **Due date** — native `<input type="date">` calendar picker, defaults to today.
  - **Duration** — stepper with ± 1 min buttons and free-entry input; validated on blur (min: 1 min).
  - **Assignee** — chip picker (Unassigned + one chip per person); hidden when no people exist.
- Keyboard: `Cmd/Ctrl+Enter` submits; `Escape` closes.

#### All-Done State
- When no today tasks remain: breathing orb + congratulatory message + completed task log.

---

### 3.2 Matrix Page

**Purpose:** Visualize and manage the full task backlog by Eisenhower quadrant.

#### Toolbar (Top Strip)
- **Left — Unclassified bar:** horizontal scrollable strip of unclassified task chips. Each chip shows quadrant dot, task title, AI suggestion badge (when available). Accepts drag-drop from any quadrant card. Styled with dashed border when empty.
- **Right — AI Classify button:** always visible; shows count of all active tasks. Disabled only when no active tasks exist.

#### 2×2 Quadrant Grid
- Four equal panels: Q1 (red), Q2 (green), Q3 (cyan), Q4 (graphite).
- Each panel: header with color dot, quadrant code + label, subtitle, task count.
- Accepts drag-drop from other panels and from the Unclassified bar.
- Drag-over: panel border becomes accent-colored with inset glow.

#### Matrix Task Card

Matrix cards use the **same interaction model as the Today task row**:

| Zone | Interaction |
|------|-------------|
| **Complete circle** (left, 16px) | Hover → shows checkmark; click → marks complete |
| **Content area** (center) | Click → opens Task Detail Modal |
| **Start Focus pill** (hover, right) | Navigates to `/focus` |
| **··· more button** (hover, right) | Dropdown: Edit → Task Edit modal, Delete → removes task |
| **Assignee avatar** (right, always) | Always visible when set |

Cards are draggable (HTML5 DnD, `cursor: grab`, `opacity: 0.4` while dragging). Buttons use `onMouseDown` stop-propagation to avoid accidentally initiating drag on click. The content area does NOT stop propagation — users can drag from the title area.

#### Unclassified Chip
- Displays in the top toolbar strip.
- Shows: quadrant dot (grey), task title, AI suggestion badge (`chip-ai` class).
- Draggable; drop onto any quadrant panel to classify.

#### AI Classify Modal
- **Covers ALL active tasks**, not just unclassified ones.
- Unclassified tasks appear first; already-classified tasks below.
- Per row: current quadrant chip (for classified tasks), task title, hint text ("Lumo suggests Qx" or "Current: Qx"), quadrant selector buttons (Q1–Q4).
- Summary bar: live count per quadrant + "N items pending change" when modified.
- Apply button: disabled until at least one quadrant changes; only submits tasks that actually changed.
- Close via X button or `Escape` key.

---

### 3.3 Focus Page

**Purpose:** Distraction-free Pomodoro timer for the current task.

#### Timer Experience
- Full-viewport canvas. Topbar hidden; sidebar visible.
- Ambient radial gradient background (subtle accent glow).
- Top strip: quadrant chip, task title, next step text, "Do not disturb" indicator, Exit button.
- SVG progress ring (380px): gradient arc from `--accent-primary` to `--accent-dim`; rotating dot at leading edge.
- Center: round number label, **large `MM:SS` countdown** (88px mono), action buttons.

#### Action Buttons (vertical stack, center canvas)
1. **Mark complete** (primary) — accent-filled pill button; marks task done + navigates to Today.
2. **Pause / Resume** (secondary) — slim border pill; toggles timer state; icon changes between `IconPause` / `IconPlay`.

#### Metadata Row (below buttons)
- Estimated duration and actual elapsed time, side by side.

#### Empty State (no today tasks)
- Ghost SVG ring with reduced opacity.
- Breathing triple-orb Lumo animation.
- Ghost "25:00" display.
- Heading + description + two CTAs: "Go to Today" (primary), "Open Matrix" (secondary).

#### Task Selection Logic
- Picks the first `today: true, quadrant: "Q1", completed: false` task.
- Falls back to first `today: true, completed: false` task.

---

### 3.4 Settings Page

Five settings sections, each a card group:

| Section | Contents |
|---------|----------|
| **Appearance** | Accent color (4 swatches), layout density (Comfortable / Compact), Reduced motion toggle |
| **Language** | Locale selector (English / 中文) |
| **Members** | Add/edit/remove team members; each member has name, email (optional), initials (auto-derived), color (8-swatch palette) |
| **Data** | Reset demo data button, Replay onboarding button |

#### Members Section (Settings → 成员)
- Lists all people with: colored initials avatar, name, email, Edit / Remove buttons.
- "Add member" link in section header → inline form expands at bottom of list.
- Inline form: name input (auto-derives initials), email input, initials override, 8-color picker. Avatar preview updates live as user types.
- Edit: expands the same form inline for the selected person.
- Remove: immediately deletes person and clears `assignee_id` on any tasks that referenced them.
- Empty state: italic placeholder text.

---

### 3.5 Onboarding Flow

Five-step wizard shown on first launch (or after "Replay onboarding"):

| Step | Content |
|------|---------|
| 1. Welcome | Brand intro, tagline, "Let's set it up" CTA |
| 2. Language | Choose English or 中文; applies immediately |
| 3. Accent color | 4 swatches; live preview via CSS vars |
| 4. Density | Comfortable vs. Compact; live preview |
| 5. Done | "All set" confirmation, "Open the matrix" CTA |

- Settings applied immediately on selection (not on final confirm).
- Progress dots at bottom; Back/Next navigation; Skip available on each step.

---

### 3.6 Authentication (Local-First)

**Default mode:** No account required. All data stored in `localStorage`. Fully functional without sign-in.

**Optional sign-in** (for cloud sync, future):
- Login: email + password + OAuth (Google / Apple / GitHub).
- Register: email, password, confirm, optional nickname.
- Sidebar footer: user avatar + plan badge when signed in; "Sign In" pill when local-only.

### 3.7 Account Page (`/account`)

Visible to all users; some sections require sign-in.

| Section | Content |
|---------|---------|
| **Profile card** | Avatar initials, name, email, plan badge, renewal date |
| **Usage** | Task count, Pomodoro count, Sync status (3-column grid) |
| **Plan** | Plan name + renewal date; management CTA = "Coming soon" badge |
| **Security** | Change Password (→ `/account/change-password`), Sign Out |
| ~~Danger zone~~ | **Removed** — account deletion not offered in v1 |

#### Excluded capabilities (intentional, not bugs)
- **Delete account** — excluded; no self-serve deletion path.
- **Sign out all devices** — excluded; sessions are device-scoped in v1.
- **Plan management** — "Coming soon"; subscription/billing not yet implemented.

### 3.8 Change Password Page (`/account/change-password`)

- Three fields: Current password, New password, Confirm new password.
- Client-side validation: all fields required, passwords match, min 8 characters.
- Submit: calls `POST /auth/change-password`; shows green success state, auto-redirects to `/account` after 1.6s.
- Back link: `← Account` in top-left.

---

## 4. Data Model

All types live in `src/types/task.ts`. Never redefine in components — import from there.

### Task
```typescript
interface Task {
  id: string;
  title: LocalizedString;
  desc?: LocalizedString;
  quadrant: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'unclassified';
  today: boolean;               // included in today's plan
  due: string | null;           // ISO date string, e.g. "2026-05-17"
  duration: number;             // estimated minutes
  pomos_done: number;
  pomos_total: number;
  assignee_id?: string;         // Person.id reference
  conviction?: number;          // 0–1, AI confidence for recommendation
  next_step?: LocalizedString;  // AI-suggested next action
  reason?: LocalizedString;     // AI rationale for today recommendation
  ai_suggest?: Quadrant;        // AI-suggested quadrant (when unclassified)
  completed?: boolean;
  not_now?: Array<{ id: string; reason: LocalizedString }>;
}
```

### Person
```typescript
interface Person {
  id: string;
  name: string;
  initials: string;   // 1–2 chars, shown in avatar bubble
  color: string;      // hex, from preset palette
  email?: string;
}
```

### CompletedEntry
```typescript
interface CompletedEntry {
  id: string;
  taskId?: string;            // original Task.id for reopen
  title: LocalizedString;
  duration: number;           // actual minutes
  quadrant?: Quadrant;
  startedAt?: string;         // ISO timestamp
  completedAt?: string;       // ISO timestamp
}
```

### User
```typescript
interface User {
  id: string;
  name: string;
  email: string;
  initials: string;
  local: boolean;
  plan?: 'free' | 'pro';
  renewsAt?: string;
  stats?: { tasks: number; pomodoros: number; syncOK: boolean };
}
```

### LocalizedString
```typescript
interface LocalizedString {
  en: string;
  zh?: string;  // falls back to en when missing
}
```

---

## 5. API Layer Architecture

### Design Principle
**One file to swap for a real backend:** `src/api/client.ts`.

All functions are `async` and return `Promise<T>` — callers are unchanged when switching from mock to production.

```
.env                → VITE_API_MODE=mock   (default, local dev)
.env.production     → VITE_API_MODE=real + VITE_API_BASE=https://api.lumotask.app
```

### Persistence
- Mock: in-memory state snapshotted to `localStorage["lumo.tasks.v1"]` after every mutation.
- Backward-compatible migration: fields missing from old snapshots fall back to seed data (e.g. `people` added in v2).
- Clear `localStorage["lumo.tasks.v1"]` in devtools to reset to seed.

### API Endpoints (implemented in mock; ready for real backend)

| Resource | Method | Path | Purpose |
|----------|--------|------|---------|
| User | GET | `/user` | Current user profile |
| Auth | POST | `/auth/signin` | Email/password sign-in |
| Auth | POST | `/auth/register` | New account registration |
| Auth | POST | `/auth/change-password` | Change password (requires current password) |
| Auth | POST | `/auth/signout` | Sign out |
| Tasks | GET | `/tasks` | Full task list |
| Tasks | POST | `/tasks` | Create task |
| Tasks | PUT | `/tasks/:id` | Update task fields |
| Tasks | DELETE | `/tasks/:id` | Hard delete task |
| Tasks | POST | `/tasks/:id/complete` | Mark complete + create log entry |
| Tasks | DELETE | `/tasks/:id/complete` | Reopen (uncomplete) task |
| People | GET | `/people` | All people (team members) |
| People | POST | `/people` | Create person |
| People | PUT | `/people/:id` | Update person |
| People | DELETE | `/people/:id` | Delete person + clear assignee refs |
| AI | POST | `/ai/classify` | Batch quadrant suggestions for tasks |
| AI | POST | `/ai/recommend` | Today's primary task recommendation |
| AI | POST | `/ai/parse` | Natural language → structured task |
| Focus | POST | `/focus/sessions` | Start/complete a Pomodoro session |
| Settings | GET | `/settings` | User app settings |
| Settings | PUT | `/settings` | Update settings |

### Mock Latency

| Operation | Simulated latency |
|-----------|------------------|
| CRUD | 80–120ms |
| AI classify / recommend | 400–800ms |
| NLP parse | 150–300ms |

### Store Layer
```
Component → Store action → api.method() → localStorage / HTTP
```

Stores and their responsibilities:
- `useTasksStore` — all task CRUD, completed log, optimistic updates
- `usePeopleStore` — people CRUD, `byId` selector
- `useAppStore` — locale, accent, density, reducedMotion, onboarding state
- (future) `useAuthStore` — user profile, isSignedIn flag

**Rule:** Components never import from `src/api/` directly. Only stores call API functions.

---

## 6. Technical Architecture

### Stack
| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript (strict) |
| Build | Vite 5 (`base: "./"` for Electron file:// compatibility) |
| Routing | React Router v6 (`HashRouter` — hash URLs work over both HTTP and `file://`) |
| State | Zustand (no persist middleware — custom localStorage in API layer) |
| Styling | CSS custom properties + Tailwind utility classes |
| Icons | Inline SVG components in `src/components/icons.tsx` |
| Persistence | `localStorage` (mock); HTTP API (real) |
| Desktop | Electron 31 + electron-builder 24, NSIS installer (Windows x64); `make package-win` |

### Routing

| Route | Component | Auth | Notes |
|-------|-----------|------|-------|
| `/` | → `/today` | No | Redirect |
| `/today` | `TodayPage` | No | Main landing |
| `/matrix` | `MatrixPage` | No | Eisenhower grid |
| `/focus` | `FocusPage` | No | Full-screen timer |
| `/settings` | `SettingsPage` | No | Local preferences |
| `/account` | `AccountPage` | No | Shows sign-in CTA when local |
| `/account/change-password` | `ChangePasswordPage` | Yes | Requires active session |
| `/login` | `LoginPage` | No | Email/pass + OAuth |
| `/register` | `RegisterPage` | No | New account |
| `/onboarding` | `OnboardingPage` | No | First-run only |

### File Organization
```
web-app/
├── electron/
│   ├── main.cjs       # Electron main process (frameless window, IPC handlers)
│   └── preload.cjs    # contextBridge — exposes window.electronAPI to renderer
└── src/
    ├── api/           # API client (client.ts) — only file that changes for real backend
    ├── components/    # Shared UI: Shell, QuickCreate, TaskRow, AIClassifyModal, etc.
    ├── i18n/          # String tables (strings.ts) + hooks (useT.ts)
    ├── lib/           # Pure helpers: format.ts (fmtDuration, fmtMMSS, getDueLabel)
    ├── mocks/         # Seed data: tasks.ts, people.ts, user.ts
    ├── pages/         # Page-level components: TodayPage, MatrixPage, FocusPage, SettingsPage
    ├── store/         # Zustand stores: useTasksStore, usePeopleStore, useAppStore, useAuthStore
    └── types/         # Domain types: task.ts, electron.d.ts (Window.electronAPI + CSSProperties)
```

---

## 7. Visual Design System

### CSS Custom Properties (Design Tokens)
All tokens are defined in `src/index.css` and overridden by the accent theme system.

| Category | Key Tokens |
|----------|-----------|
| Surfaces | `--bg-base`, `--bg-surface`, `--bg-elevated`, `--bg-subtle`, `--bg-deep` |
| Borders | `--border-default`, `--border-strong`, `--border-faint` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint` |
| Accent | `--accent-primary`, `--accent-dim`, `--accent-glow`, `--accent-fog`, `--accent-edge` |
| Quadrants | `--q1-color` (red), `--q2-color` (green), `--q3-color` (cyan), `--q4-color` (graphite) |

### CSS Component Classes
| Class | Usage |
|-------|-------|
| `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost` | All buttons |
| `.input` | All text inputs |
| `.chip`, `.chip-q1`–`.chip-q4`, `.chip-ai` | Quadrant + AI badges |
| `.qdot`, `.qdot-q1`–`.qdot-q4`, `.qdot-un` | 6px colored dots |
| `.pip` | Pomodoro pip row (filled/unfilled dots) |
| `.scroll-y` | Scrollable containers with thin scrollbar |
| `.fade-in` | Entry animation for pages/modals |
| `.lumo-glyph` | Animated Lumo orb (halo + core) |
| `.lumo-pulse` | Ambient 1px top-bar shimmer |
| `.nav-item`, `.nav-item.active` | Sidebar navigation items |

### Accent Themes
Four themes, applied by JS writing CSS vars to `:root`:
- **Lumo Green** (default): `#3DFFA0`
- **Calm Cyan**: `#38D4D4`
- **Warm Amber**: `#FFAA44`
- **Graphite**: `#A0ADB0`

---

## 8. Internationalization

- Locale stored in `useAppStore`.
- All static UI strings: `src/i18n/strings.ts` → `useT()` hook.
- Domain object text (task titles, descriptions): `LocalizedString` → `useLocaleString()` hook.
- Date/time formatting: locale-aware via `fmtDuration(duration, locale)`.
- Fallback: `zh` fields are optional; missing values fall back to `en`.

---

## 9. Development Workflow

### Commands
```bash
npm run dev        # dev server at :5173
npm run build      # tsc -b + vite build
npm run typecheck  # tsc --noEmit
```

### CI Gate (GitHub Actions)
Three jobs on every push: **Type Check** (`tsc --noEmit`) → **Lint** (ESLint) → **Build** (`vite build`).
Branch protection on `main` requires all three. Squash merge only.

---

## 10. Roadmap

### Done ✅
- Full-viewport shell (sidebar 220px + topbar 56px + content)
- Mock API + localStorage persistence with schema migration
- Today page: hero card, task list, completed log, all-done state, Quick Create modal
- Matrix page: 2×2 grid, unclassified toolbar strip, HTML5 DnD, AI Classify modal (all tasks)
- Focus page: SVG progress ring, vertical button stack, empty state
- Settings page: appearance, language, **members management**
- Onboarding: 5-step wizard
- Bilingual (en / zh) throughout
- 4 accent themes
- **Assignee/People feature**: Settings members CRUD, avatar display in Today + Matrix, QuickCreate picker
- Task reopen from completed log (timeline with timestamps)
- **Task Edit Modal**: full CRUD — title, quadrant, due date, duration, assignee (no today toggle — today is managed via row actions only)
- **Task Detail Modal**: fields + Next step; footer: Start Focus (primary) / Complete (secondary) / Edit (ghost) — no Today toggle
- **Unified task card interaction model**: complete circle, Start Focus pill, ··· more menu (Edit/Delete), click-for-detail; applied to both Today (`TaskRow`) and Matrix (`MatrixTaskCard`)
- **Matrix drag-and-drop preserved** with new card interaction model via `onMouseDown` stop-propagation on buttons
- **Account page**: usage stats, plan (Coming soon), change password, sign out; no delete account, no sign-out-all
- **Change Password page** (`/account/change-password`): full form + validation + success redirect
- **Electron desktop packaging** — Windows NSIS installer via `make package-win`; frameless window; custom min/max/close controls in Topbar styled to app design; IPC bridged via `preload.cjs`; HashRouter for `file://` compatibility

### High Priority Next
- [ ] Real Pomodoro timer (survives tab-switch / minimize; Web Worker for background persistence)
- [ ] Search (fuzzy, ⌘K shortcut, cross-page)
- [ ] Natural language task parse (`/ai/parse` endpoint + compose bar)
- [ ] Unit + integration tests (Vitest + Testing Library)

### Later
- [ ] Real AI backend (Anthropic Claude for classify / recommend / parse)
- [ ] Cloud sync (Supabase or custom API)
- [ ] macOS packaging (Electron DMG / pkg)
- [ ] Recurring tasks
- [ ] Weekly review view
- [ ] Push notifications / system tray (Electron)
- [ ] Filter by assignee

### Out of Scope (v1)
- Multi-user collaboration / shared workspaces
- Project / sub-project hierarchy (tasks are flat)
- Email or calendar integration
- Billing / payment flows

---

## 11. Phase 2 — Backend Implementation Scope

The frontend is complete and running against a mock API (`src/api/client.ts`). The next phase is implementing the real backend. This section summarizes what the backend must provide for a seamless frontend integration.

### Swap Contract
Replace each function in `src/api/client.ts` with a `fetch()` call to the corresponding endpoint. **No other files change.** The store layer and all components are already wired correctly.

### Required Endpoints
All endpoints are fully specified in `docs/api/openapi.json`, generated from the
route registry in `@lumo/contracts`. Summary of backend responsibilities:

| Endpoint | Key backend behavior |
|----------|---------------------|
| `POST /auth/signin` | Validate credentials, issue session cookie + return User |
| `POST /auth/register` | Create account, derive initials from nickname/email, issue session |
| `POST /auth/change-password` | Verify current password server-side before accepting new one |
| `POST /auth/signout` | Invalidate session cookie |
| `GET /user` | Return User with `stats` populated (task count, pomodoro count, syncOK) |
| `GET /tasks` | Return all active (non-completed) tasks, with all LocalizedString fields |
| `POST /tasks` | Create task; auto-set `pomos_total = ceil(duration/25)` |
| `PATCH /tasks/{id}` | Partial update — accept any subset of Task fields |
| `POST /tasks/{id}/complete` | Set `completed: true`, create CompletedEntry with timestamps |
| `DELETE /tasks/{id}/complete` | Remove CompletedEntry, restore task to active state |
| `DELETE /people/{id}` | **Cascade:** clear `assignee_id` on all tasks that reference this person |
| `POST /ai/classify` | Can be stubbed initially (return random Q1–Q4 per task) |
| `POST /ai/recommend` | Can be stubbed (return highest-conviction Q1 task) |
| `POST /ai/parse` | Can be stubbed (return empty TaskCreate with confidence 0) |
| `POST /focus/sessions` | Increment `pomos_done` on the task; return updated Task |
| `GET /settings` | Return stored settings or defaults |
| `PATCH /settings` | Partial update of user settings |

### Authentication Model
- Session cookie (`lumo_session`) preferred; Bearer JWT accepted as fallback.
- All endpoints except `/auth/*` require a valid session.
- `local: true` users have no server session — the backend should treat missing cookies as local-only mode and return 401 where appropriate.

### LocalizedString Policy
- Tasks, people, and AI responses use `LocalizedString` objects (`{ en: string; zh?: string }`).
- The backend stores both locales. The frontend resolves which to display based on the user's locale setting — **do not return a pre-resolved string**.

### AI Stubs (acceptable for v2 launch)
The three AI endpoints (`/ai/classify`, `/ai/recommend`, `/ai/parse`) can be implemented as rule-based stubs at first:
- **classify**: return Q1 for tasks with due dates in the past, Q2 for near-future, Q3/Q4 otherwise.
- **recommend**: return the first Q1 task with `today: true`; set `conviction: 0.8`, `next_step: { en: "Start now" }`.
- **parse**: extract obvious keywords (numbers → duration, "fri/fri" → due), set `confidence: 0.6`.

Real Claude integration can replace stubs in a later sprint without any frontend changes.
