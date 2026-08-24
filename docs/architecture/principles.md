# Lumo Task — Core Development Principles

This document captures the authoritative rules, conventions, and interaction standards for the Lumo Task frontend. Use it as the reference when designing new features, reviewing PRs, or onboarding contributors.

---

## 1. Architecture Rules

### 1.1 Layered Data Flow

```
Component/Page
    ↓ calls store action
Zustand Store (useTasksStore, usePeopleStore, useAppStore)
    ↓ calls api.*
src/api/client.ts  ←── mock today, real fetch tomorrow
    ↓ reads/writes
localStorage (mock) / REST API (production)
```

- **Components never touch localStorage directly.** No `localStorage.getItem` in any component or hook.
- **Components never import from `src/mocks/`.** Seed data and mock helpers are strictly internal to the API layer.
- **Components never call `api.*` directly.** They dispatch store actions. The store owns optimistic updates, error recovery, and loading flags.
- **Types are the contract.** `src/types/task.ts` defines `Task`, `Person`, `User`, `CompletedEntry`. If a field is missing, add it to the type first, then wire through. Do not redefine these shapes locally.

### 1.2 API Client Contract

Every function in `src/api/client.ts` must:

- Return a `Promise<T>` — never a synchronous value.
- Simulate latency via `await delay(...)` so loading states are always exercised.
- Mirror the shape a real REST endpoint would return (same field names, same nesting).

To swap in a real backend: replace the body of each `api.*` function with a `fetch()` call. Callers do not change.

### 1.3 Store Actions

Each store (Zustand) action pattern:

```typescript
async addTask(input) {
  // 1. Optimistic local update (optional but preferred for mutations)
  set(state => ({ tasks: [optimistic, ...state.tasks] }))
  try {
    const result = await api.createTask(input)
    // 2. Replace optimistic with confirmed server response
    set(state => ({ tasks: state.tasks.map(t => t.id === optimistic.id ? result : t) }))
  } catch {
    // 3. Roll back on error
    set(state => ({ tasks: state.tasks.filter(t => t.id !== optimistic.id) }))
  }
}
```

---

## 2. Type System

### 2.1 LocalizedString

All user-visible text on domain objects (task title, description, next step, reason) uses `LocalizedString`:

```typescript
interface LocalizedString { en: string; zh?: string }
```

- Use `useLocaleString()` hook to resolve to the active locale's string.
- Static UI labels (button text, section headers) live in `src/i18n/strings.ts` and are accessed via `useT(key)`.

### 2.2 Adding Fields

1. Add to `src/types/task.ts` (optional fields default to `?`).
2. Update `src/mocks/tasks.ts` seed data so the UI has something to render.
3. Update `src/api/client.ts` if the field requires API handling.
4. Update relevant Zustand store actions.
5. Use from components.

Never add a field to a component that isn't declared in the type.

---

## 3. Styling & Design Tokens

### 3.1 Never Use Raw Hex Colors

All colors come from CSS custom properties defined in `src/styles/tokens.css`:

```css
/* Correct */
color: var(--text-primary)
background: var(--bg-elevated)
border-color: var(--border-default)

/* Wrong */
color: #1a1a1a
background: #ffffff
```

Quadrant colors: `var(--q1-color)` through `var(--q4-color)`.  
Accent colors: `var(--accent-primary)`, `var(--accent-fog)`, `var(--accent-glow)`, `var(--accent-edge)`.

### 3.2 Tailwind Semantic Classes

Prefer Tailwind utility classes that map to semantic tokens:

```
bg-surface, bg-subtle, bg-elevated
text-text-primary, text-text-secondary, text-text-muted, text-text-faint
border-border-faint, border-border-default, border-border-strong
```

Use inline `style={{ color: "var(--accent-primary)" }}` only when a Tailwind class doesn't exist for that token.

### 3.3 CSS Classes for Reusable Patterns

Use global CSS classes from `src/styles/global.css` for standard patterns:

| Class | Use |
|-------|-----|
| `.btn.btn-primary` | Primary action button |
| `.btn.btn-secondary` | Secondary action button |
| `.btn.btn-ghost` | Tertiary / text button |
| `.btn.btn-danger` | Destructive action |
| `.chip.chip-q1` … `.chip-q4` | Quadrant label chips |
| `.qdot.qdot-q1` … `.qdot-un` | Quadrant color dot (7px circle) |
| `.pip` + `i.on` | Pomodoro pip progress indicator |
| `.input` | Standard text input |
| `.fade-in` | Entrance opacity animation |

### 3.4 Layout

- The app fills the viewport. No `max-width` container around the shell.
- Sidebar: 220px fixed width.
- Topbar: 56px fixed height.
- Focus page: hides topbar, content fills `inset: 56px 0 0` → effectively full-screen.
- No window chrome, no card-like centered background — this is a web/desktop app pattern.

---

## 4. Interaction Conventions

### 4.1 Task Row Standard Layout

```
[complete circle] [qdot] [title + meta] [hover: Start Focus pill · ··· menu] [assignee] [quadrant chip]
```

This layout is **universal** — used identically in Today (`TaskRow`) and Matrix (`MatrixTaskCard`).

| Zone | Always visible | Behavior |
|------|---------------|----------|
| Complete circle (left) | Yes | Hover → checkmark preview; click → `complete(id)` |
| Quadrant dot | Yes | Color indicator only |
| Title + meta (center) | Yes | Click → Task Detail Modal |
| Start Focus pill | On row hover | Navigates to `/focus` |
| ··· more button | On row hover | Opens `TaskMoreMenu` dropdown: Edit → Edit Modal, Delete → `remove(id)` |
| Assignee avatar | Yes (when set) | No action |
| Quadrant chip | Yes (when set) | Click → Task Detail Modal |

**Hover reveal pattern:**
```tsx
<div style={{
  opacity: hovered ? 1 : 0,
  pointerEvents: hovered ? "auto" : "none",
}}>
  {/* action buttons — always in DOM, never affect layout */}
</div>
```

**Matrix DnD compatibility:** In `MatrixTaskCard`, all interactive buttons set `onMouseDown={(e) => e.stopPropagation()}` to prevent the `draggable` container from initiating a drag when the user clicks a button. The content area does NOT stop propagation — dragging from the title area works.

### 4.2 Modals

All modals:
- Are rendered via `createPortal(..., document.body)` to escape scroll containers and stacking contexts.
- Have a real **close button (X)** in the header. `Esc` is a convenience shortcut but never the only affordance.
- Are dismissable by clicking the backdrop overlay.
- Enter with `.fade-in` CSS animation.

**Detail Modal** → shows read-only task info. Footer: **Start Focus** (primary) | **Complete** (secondary) | **Edit** (ghost, right). No Today toggle.
**Edit Modal** → full CRUD form for title, quadrant, due, duration, assignee.

### 4.3 Confirm-to-Delete Pattern

Destructive deletes require two clicks:

```
First click:  button text changes to "Confirm delete?" (warning color)
Second click: executes delete + closes modal
Timer reset:  after 3 seconds of inactivity, first state is restored
```

### 4.4 Hover-Reveal Actions

```tsx
<div style={{
  opacity: hovered ? 1 : 0,
  pointerEvents: hovered ? "auto" : "none",
  transition: "opacity 150ms",
}}>
  {/* action buttons */}
</div>
```

Always use CSS `opacity` + `pointer-events`, never `display: none` / `visibility`. This prevents layout shift.

### 4.5 Quadrant Picker (2×2 Grid)

Always render quadrant selection as a 2×2 grid with color-coded borders:

```
[Q1 Urgent+Important] [Q2 Important·Not Urgent]
[Q3 Urgent·Not Imp.]  [Q4 Neither]
```

Selected quadrant gets `border: 2px solid var(--q{n}-color)` and `background: var(--q{n}-color)20`.

---

## 5. Modal Lifecycle & State Ownership

### 5.1 The Core Rule

**Modal state must be owned by the nearest stable parent**, not by the component that triggers the close action.

### 5.2 Anti-Pattern (wrong)

```tsx
function Popover({ onClose }) {
  const [editOpen, setEditOpen] = useState(false)  // ← WRONG
  return (
    <>
      <button onClick={() => { onClose(); setEditOpen(true); }}>Edit</button>  // onClose unmounts this!
      {editOpen && <EditModal />}  // never renders
    </>
  )
}
```

### 5.3 Correct Pattern

```tsx
// Parent owns the modal state
function Parent() {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  return (
    <>
      <Popover onClose={() => setPopoverOpen(false)} onEdit={() => setEditOpen(true)} />
      {editOpen && <EditModal onClose={() => setEditOpen(false)} />}
    </>
  )
}
```

### 5.4 Detail → Edit Modal Replacement Pattern

When a Detail Modal's "Edit" button is clicked, replace itself with the Edit Modal (no layering):

```tsx
function TaskDetailModal({ task, onClose }) {
  const [editOpen, setEditOpen] = useState(false)
  if (editOpen) {
    return <TaskEditModal task={task} onClose={() => { setEditOpen(false); onClose(); }} />
  }
  return createPortal(<...detail view...>, document.body)
}
```

---

## 6. Internationalization (i18n)

### 6.1 Two Types of Strings

| Type | Where | Hook |
|------|-------|------|
| Static UI labels | `src/i18n/strings.ts` | `useT(key)` |
| Domain object text (titles, descriptions) | `LocalizedString` field on Task etc. | `useLocaleString()(field)` |

### 6.2 Adding a New UI String

Add entries for **both** `en` and `zh` simultaneously:

```typescript
// src/i18n/strings.ts
"myfeature.label": { en: "My Label", zh: "我的标签" },
"myfeature.action": { en: "Do Thing", zh: "执行操作" },
```

Never ship a feature with missing zh translations. Use a reasonable zh fallback if unsure — it can be refined.

### 6.3 Locale-Aware Formatting

- Dates/times: use `getDueLabel(task.due, locale)` from `src/lib/format.ts`.
- Durations: use `fmtDuration(minutes, locale)` from `src/lib/format.ts`.
- Pomodoro counts: `{done}/{total}` is universal — no localization needed.

---

## 7. Component Design Rules

### 7.1 No Prop Drilling Beyond 2 Levels

If data needs to travel more than two component hops, put it in a Zustand store, not in props. This keeps component trees shallow and refactorable.

### 7.2 No Inline Logic in JSX

Extract non-trivial derivations before the `return`:

```tsx
// Correct — derive before render
const qLabel = locale === "zh" ? Q_LABEL_ZH[task.quadrant] : Q_LABEL_EN[task.quadrant]
const due = getDueLabel(task.due, locale)

// Wrong — logic inside JSX
<span>{locale === "zh" ? Q_LABEL_ZH[task.quadrant] : Q_LABEL_EN[task.quadrant]}</span>
```

### 7.3 Icon Components

All SVG icons live in `src/components/icons.tsx` as named exports (`IconArrowRight`, `IconEdit`, `IconCheck`, etc.). Props: `size?: number`, `strokeWidth?: number`, `className?: string`.

Never inline SVG paths directly in component files.

### 7.4 No Comments for Obvious Code

Write comments only when the **why** is non-obvious. Never comment what the code already says through naming.

---

## 8. State Management

### 8.1 Store Responsibilities

| Store | Owns |
|-------|------|
| `useTasksStore` | tasks[], completed[], loading flags, CRUD + complete/uncomplete actions |
| `usePeopleStore` | people[], CRUD actions |
| `useAppStore` | locale, accent, density, reducedMotion |

### 8.2 Derived Data in Components

Don't cache derived values in stores. Compute them in the component or in `useMemo`:

```tsx
// Component
const todayTasks = useTasksStore(s => s.tasks.filter(t => t.today && !t.completed))
```

### 8.3 Loading & Error States

Every async store action should:
1. Set a loading flag before the `await`.
2. Clear it in a `finally` block.
3. Surface errors via `toast.error()` from `@/store/useToastStore` — never `console.error` only, never a bespoke inline `<div>`.

---

## 9. Error Notification Standard

All user-visible errors must go through the unified toast system (`useToastStore` / `ToastStack`). This section defines the rules for message content and when to use which severity level.

### 9.1 The Four Severity Levels

| Level | Token | When to use |
|-------|-------|-------------|
| `error` | `--status-urgent` (#ff6b6b) | An operation failed and the user must act or retry. Data was **not** saved. |
| `warning` | `--status-warning` (#ffb347) | The operation completed but with a caveat. Data was saved, but something is degraded. |
| `success` | `--status-success` (#a8e64b) | A significant action completed — use sparingly (not every save needs confirmation). |
| `info` | `--status-info` (#5bc8d4) | Neutral background information the user should know but doesn't need to act on. |

### 9.2 Message Content Rules

A well-formed error message has three components:

```
[title]   — What went wrong (noun phrase, ≤ 30 chars, no trailing period)
[message] — Why it happened + what the user can do (1–2 sentences)
```

**Industry-standard checklist for every error:**

- **Say what failed** — name the specific action, not a generic "操作失败".  
  ✓ `"创建任务失败"` &nbsp; ✗ `"操作失败"`
- **Give the reason** — include the underlying cause when it is user-actionable.  
  ✓ `"服务器返回 401，请重新登录"` &nbsp; ✗ `"Unauthorized"`
- **State what to do next** — when recovery is non-obvious, say so.  
  ✓ `"请检查网络连接后重试"` &nbsp; ✗ (silent)
- **Use plain language** — no raw HTTP status codes, no stack traces, no internal identifiers in the title.
- **Keep it honest** — do not say "成功" and show a toast for a partial write. Use `warning` instead.
- **Match the locale** — title and message must both be in the active locale (Chinese when `locale === "zh"`).

### 9.3 Standard Error Message Patterns

Use these patterns consistently. Map backend error shapes to them in `src/api/client.ts` before they reach the store.

All toast titles **must** come from the i18n system (`strings.ts`) so they switch automatically with the user's language. Hard-coding a Chinese or English string is a violation of this standard.

```ts
// Correct: title from i18n, message is the raw API error
import { t } from "@/i18n/useT";
toast.error(t("error.task.create"), msg);

// Wrong: hard-coded string
toast.error("创建任务失败", msg);   // ❌ breaks English locale
toast.error("Failed to create task", msg); // ❌ breaks Chinese locale
```

| Scenario | i18n key | EN title | ZH title |
|---|---|---|---|
| Load tasks | `error.task.load` | Failed to load tasks | 加载任务失败 |
| Create task | `error.task.create` | Failed to create task | 创建任务失败 |
| Update task | `error.task.update` | Failed to update task | 更新任务失败 |
| Complete task | `error.task.complete` | Failed to complete task | 完成任务失败 |
| Reopen task | `error.task.reopen` | Failed to reopen task | 恢复任务失败 |
| Delete task | `error.task.delete` | Failed to delete task | 删除任务失败 |
| Load members | `error.person.load` | Failed to load members | 加载成员失败 |
| Add member | `error.person.create` | Failed to add member | 添加成员失败 |
| Update member | `error.person.update` | Failed to update member | 更新成员失败 |
| Remove member | `error.person.delete` | Failed to remove member | 删除成员失败 |
| Sign in | `error.auth.signin` | Sign in failed | 登录失败 |
| Register | `error.auth.register` | Registration failed | 注册失败 |
| Sign out | `error.auth.signout` | Sign out failed | 退出登录失败 |
| Network unreachable | `error.network` | Network unavailable | 网络连接失败 |
| Session expired (401) | `error.auth.expired` | Session expired | 登录已过期 |
| Permission denied (403) | `error.forbidden` | Permission denied | 权限不足 |
| Server error (5xx) | `error.server` | Server error | 服务器错误 |

### 9.4 How to Call the Toast

The `t()` helper in `@/i18n/useT` works outside React components (Zustand stores, utility functions). Use it for all toast titles.

```ts
import { toast } from "@/store/useToastStore";
import { t } from "@/i18n/useT";

// Minimal — title only (validation, simple confirmations)
toast.error(t("account.changePass.err.mismatch"));

// Full — title + actionable message (API failures)
toast.error(t("error.task.create"), mapApiError(msg));

// Duration override — persistent until dismissed (critical, blocking errors)
toast.error(t("error.auth.expired"), t("error.auth.expired.detail"), { duration: 0 });

// Standard store action pattern
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  toast.error(t("error.task.update"), mapApiError(msg));
  throw e;
}
```

### 9.5 Mapping API Errors

Raw server error strings are often not user-friendly. Map them in a central helper before passing to toast:

```ts
// src/api/client.ts (or a dedicated src/lib/errors.ts)
import { t } from "@/i18n/useT";

export function mapApiError(raw: string): string {
  if (raw.includes("401") || raw.toLowerCase().includes("unauthorized"))
    return t("error.api.unauthorized");
  if (raw.includes("403"))
    return t("error.api.forbidden");
  if (raw.includes("404"))
    return t("error.api.notfound");
  if (raw.includes("429"))
    return t("error.api.ratelimit");
  if (/5\d\d/.test(raw))
    return t("error.api.server");
  if (raw.toLowerCase().includes("network") || raw.toLowerCase().includes("fetch"))
    return t("error.api.network");
  return raw; // fall back to raw message if no pattern matches
}
```

Add the corresponding keys to `strings.ts` under both `en` and `zh` when implementing this helper.

### 9.6 What Not to Do

| Don't | Do instead |
|---|---|
| Inline `<div>` with hardcoded `rgba(255,107,107,…)` | `toast.error(title, message)` |
| `console.error(e)` only | `toast.error()` + `throw e` so the store re-throws to the caller |
| Show raw HTTP status: `"HTTP 401"` | Map via `mapApiError()` → `t("error.api.unauthorized")` |
| Show the full stack trace or JS exception | Extract `.message` and humanize it |
| Use `error` severity for a recoverable warning | Use `warning` |
| Toast on every keystroke or micro-interaction | Reserve toast for async boundary failures |
| Swallow errors silently | Always surface something — silent failures erode trust |

---

## 11. Feature Development Checklist

When implementing any new feature, in order:

- [ ] Add/update types in `src/types/task.ts`
- [ ] Update seed data in `src/mocks/tasks.ts`
- [ ] Add API method in `src/api/client.ts`
- [ ] Expose store action in the relevant `src/store/*.ts`
- [ ] Add i18n strings in `src/i18n/strings.ts` (both `en` and `zh`)
- [ ] Implement the UI component(s)
- [ ] Verify: `npm run typecheck` — zero errors
- [ ] Verify: UI interaction in browser (golden path + edge cases)

---

## 12. What Not to Do

| Don't | Do instead |
|-------|-----------|
| `localStorage.getItem(...)` in a component | Use a store that calls `api.*` |
| Import from `src/mocks/` in a component | Import from `src/types/` and `src/api/` |
| Hard-code `#3ecf8e` or any hex | Use `var(--accent-primary)` or equivalent token |
| Add UI-only strings directly as JSX string literals | Add to `strings.ts`, use `useT()` |
| Nest two open modals simultaneously | Use the replacement pattern (§5.4) |
| Call `api.*` from a component | Dispatch a store action |
| Ship with TypeScript errors suppressed via `@ts-ignore` | Fix the type |
| Skip zh translations | Add both locales at the same time |

---

## 13. Electron Desktop Conventions

These rules apply whenever touching code that runs in the packaged desktop app.

### 11.1 Detecting Electron at Runtime

```ts
const isElectron = typeof window !== "undefined" && !!window.electronAPI;
```

Always use this pattern. **Never** check `navigator.userAgent` for "Electron" — it is less reliable and couples detection to Chromium internals.

### 11.2 Window Controls

Custom min / max / close buttons live in `Topbar.tsx` and render only when `isElectron` is `true`. They call `window.electronAPI.minimize()`, `.maximize()`, `.close()` which are bridged over Electron IPC via `electron/preload.cjs`.

### 11.3 Drag Region

When `isElectron`, the Topbar root element sets `WebkitAppRegion: "drag"` so the user can move the window by dragging the bar. Every interactive element inside the topbar (buttons, inputs, avatar) must set `WebkitAppRegion: "no-drag"` to prevent drag events from swallowing clicks.

```tsx
// Topbar root (drag)
style={{ WebkitAppRegion: isElectron ? "drag" : undefined }}

// Every button / input inside (no-drag)
style={{ WebkitAppRegion: "no-drag" }}
```

### 11.4 CSSProperties Type Augmentation

`WebkitAppRegion` is not part of React's stock `CSSProperties`. It is declared as a module augmentation in `src/types/electron.d.ts`:

```ts
export {};  // ← must be present; makes this a module, not a script

declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag";
  }
}
```

The `export {}` is mandatory — without it, `declare module "react"` replaces rather than augments the React type definitions, breaking every React import in the project.

### 11.5 Router

`HashRouter` is the canonical router for this project. **Do not revert to `BrowserRouter`.** Hash-based URLs (`/#/today`, `/#/matrix`) work identically in both Electron (`file://`) and browser (served over HTTP). No server-side route handling is required.

### 11.6 Main Process Entry Point

`electron/main.cjs` and `electron/preload.cjs` use the `.cjs` extension because `package.json` declares `"type": "module"`, which would otherwise treat `.js` files as ES modules. Electron's main process requires CommonJS. All Electron main-process code must use `.cjs`.

### 11.7 Build Output

- Vite builds the React app to `web-app/dist/` with `base: "./"` (relative asset paths, required for `file://`).
- `electron-builder` packages `dist/` + `electron/` into an NSIS installer at `web-app/dist-electron/`.
- `dist-electron/` is git-ignored — never commit build artifacts.
- The full pipeline: `make package-win` → runs `npm run build` then `npm run package:win`.
