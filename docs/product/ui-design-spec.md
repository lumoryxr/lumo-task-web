# Lumo Task — UI Design Specification

> **Audience:** Frontend engineers building or extending Lumo Task.
> **Purpose:** Canonical reference for visual design, token usage, component patterns, and interaction rules. All new UI must conform to this spec.

---

## 1. Design Philosophy

| Principle | Rule |
|-----------|------|
| **Full-viewport desktop** | The app fills the entire browser/OS window. No max-width container, no page-level card background, no centering chrome. |
| **Dark-first** | All base colors are dark (`#0d1210` base). Light mode is not planned. |
| **Accent-driven identity** | One accent color per user session. All interactive highlights derive from `--accent-primary`. |
| **Local aesthetic** | Feels like a native Windows/macOS app, not a web page. Dense information, minimal decoration. |
| **Motion with purpose** | Transitions only where they aid orientation. Respects `prefers-reduced-motion`. |

---

## 2. Layout System

### Shell Structure

```
┌──────────────────────────────────────────┐
│  Topbar (56px fixed, full width)         │
├──────────┬───────────────────────────────┤
│ Sidebar  │  Content area (flex-1)        │
│ (220px   │                               │
│  fixed)  │                               │
└──────────┴───────────────────────────────┘
```

| Zone | Size | Notes |
|------|------|-------|
| Sidebar | 220px fixed width | Never collapses. Contains nav + brand + user footer. |
| Topbar | 56px fixed height | Search, quick-add, user avatar. Hidden on Focus page. |
| Content | Remaining viewport | Scrollable per-page. No inner max-width. |
| Focus overlay | Full content area | `position: absolute; inset: 56px 0 0 0`. Hides sidebar entirely. |

### Focus Page Exception
The Focus screen hides the topbar and covers the full canvas from `top: 0` to give the timer undivided visual attention.

---

## 3. CSS Token System

All tokens live in `web-app/src/index.css` as CSS custom properties on `:root`.

### 3.1 Background

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#0d1210` | App root background |
| `--bg-surface` | `#141a17` | Cards, panels, sidebar |
| `--bg-elevated` | `#1a2420` | Dropdown menus, tooltips |
| `--bg-deep` | `#080b0a` | Deep inset areas, code blocks |
| `--bg-overlay` | `rgba(8,11,10,0.85)` | Modal scrims |

### 3.2 Text

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#e8ede9` | Headings, body copy, labels |
| `--text-secondary` | `#8fa89a` | Subtitles, descriptions |
| `--text-muted` | `#5a7268` | Placeholders, disabled, timestamps |
| `--text-inverse` | `#0d1210` | Text on light accent backgrounds |

### 3.3 Accent Themes

Four themes; user selects one. Applied by setting all five variables on `:root`.

| Theme | `--accent-primary` | `--accent-dim` | `--accent-glow` | `--accent-fog` | `--accent-edge` |
|-------|--------------------|----------------|-----------------|----------------|-----------------|
| **Green** (default) | `#3DFFA0` | `#1A7A4A` | `rgba(61,255,160,0.15)` | `rgba(61,255,160,0.08)` | `rgba(61,255,160,0.3)` |
| **Cyan** | `#38D4D4` | `#1F6E73` | `rgba(56,212,212,0.15)` | `rgba(56,212,212,0.08)` | `rgba(56,212,212,0.3)` |
| **Amber** | `#FFAA44` | `#9F6420` | `rgba(255,170,68,0.15)` | `rgba(255,170,68,0.08)` | `rgba(255,170,68,0.3)` |
| **Graphite** | `#A0ADB0` | `#52605E` | `rgba(160,173,176,0.15)` | `rgba(160,173,176,0.08)` | `rgba(160,173,176,0.3)` |

**Rule:** Never hardcode hex accent values in components. Always use `var(--accent-primary)` etc.

### 3.4 Quadrant Colors

| Token | Value | Quadrant |
|-------|-------|----------|
| `--q1-color` | `#ff6b6b` | Urgent + Important (Do First) |
| `--q2-color` | `#a8e64b` | Important, Not Urgent (Schedule) |
| `--q3-color` | `#5bc8d4` | Urgent, Not Important (Delegate) |
| `--q4-color` | `#6b7e78` | Neither (Eliminate) |

### 3.5 Status Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--status-success` | `#3DFFA0` | Confirmation, completed |
| `--status-warning` | `#FFAA44` | Caution, overdue |
| `--status-error` | `#ff6b6b` | Errors, destructive |
| `--status-info` | `#5bc8d4` | Informational |

### 3.6 Border & Radius

| Token | Value |
|-------|-------|
| `--border-subtle` | `rgba(255,255,255,0.06)` |
| `--border-default` | `rgba(255,255,255,0.10)` |
| `--border-strong` | `rgba(255,255,255,0.18)` |
| `--radius-sm` | `6px` |
| `--radius-md` | `10px` |
| `--radius-lg` | `16px` |
| `--radius-full` | `9999px` |

### 3.7 Shadow

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.4)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.5)` |
| `--shadow-lg` | `0 8px 32px rgba(0,0,0,0.6)` |
| `--shadow-accent` | `0 0 20px var(--accent-glow)` |

### 3.8 Animation Easing

| Token | Value |
|-------|-------|
| `--ease-default` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` |

---

## 4. Typography

| Use | Font | Weight | Size |
|-----|------|--------|------|
| UI labels, body | Inter | 400, 500, 600 | 13–16px |
| Chinese text | Noto Sans SC | 400, 500 | 13–16px |
| Timer, counters | JetBrains Mono | 600 | 32–64px |
| Code / debug | JetBrains Mono | 400 | 12–13px |

**Line height:** `1.5` for body, `1.2` for headings.
**Never set font-family inline** — fonts are declared at `body` level in `index.css`.

---

## 5. Component Catalog

### 5.1 Button (`.btn`)

```
.btn              Base: 8px 14px padding, 6px radius, 13px medium, transition 120ms
.btn-primary      bg: accent-primary, text: inverse, hover: 90% brightness
.btn-secondary    bg: bg-elevated, border: border-default, hover: border-strong
.btn-ghost        bg: transparent, hover: bg-elevated
.btn-danger       bg: status-error (alpha), text: status-error
.btn-lg           padding: 10px 20px, 14px font
```

**Rule:** Never use `<button>` with inline styles for these variants. Apply the CSS class.

### 5.2 Input (`.input`)

```
bg: bg-deep
border: 1px solid border-default
border-radius: radius-sm
padding: 8px 12px
color: text-primary
placeholder: text-muted
focus outline: 2px solid accent-edge, offset: -2px
```

### 5.3 Navigation Item (`.nav-item`)

```
display: flex; align-items: center; gap: 10px
padding: 8px 12px; border-radius: radius-md
color: text-secondary; font-size: 13px; font-weight: 500
transition: background 120ms, color 120ms
hover: bg: bg-elevated, color: text-primary
active (.active): bg: accent-fog, color: accent-primary
```

### 5.4 Chip (`.chip`)

```
.chip             Base: inline-flex, 4px 10px, radius-full, 11px, border
.chip-q1          bg: rgba(q1-color, 0.15), border: q1-color (30%), color: q1-color
.chip-q2          Same pattern with q2-color
.chip-q3          Same pattern with q3-color
.chip-q4          Same pattern with q4-color
.chip-ai          bg: accent-fog, border: accent-edge, color: accent-primary
.chip-unclassified bg: muted alpha, border: muted alpha, color: text-muted
```

### 5.5 Quadrant Dot (`.qdot`)

6×6px circle using `--q{n}-color` background. Used inline to indicate quadrant assignment.

### 5.6 Pomodoro Pip (`.pip`)

6×6px circle. Filled: `--accent-primary`. Empty: `var(--border-default)`. Arranged in a horizontal row to show session progress.

### 5.7 Lumo Status (`.lumo-glyph`, `.lumo-pulse`)

- `.lumo-glyph`: The "L" logomark, 20px, accent-primary color.
- `.lumo-pulse`: 2px horizontal line at the very top of the window (full width), gradient from `accent-primary` center to transparent. Pulses via CSS keyframe `lumo-pulse` when AI is working.

### 5.8 Modals

**Required structure:**
```
[Scrim: fixed inset-0, bg-overlay] 
  └── [Panel: bg-surface, radius-lg, shadow-lg, max 520px wide]
        ├── [Header: flex, justify-between, align-center]
        │     ├── [Title: text-primary, 15px, 600]
        │     └── [Close button (X): btn-ghost, 28×28px]  ← REQUIRED
        ├── [Body: scrollable if needed]
        └── [Footer: flex, justify-end, gap-8]
```

**Rules:**
- Every modal MUST have a visible close button (X) in the header. `Esc` is a convenience shortcut, never the sole affordance.
- Modal width: max 520px, centered, responsive margin on small viewports.
- Scrim click: dismiss the modal.

---

## 6. Interaction & Motion

| Scenario | Duration | Easing |
|----------|----------|--------|
| Color/bg hover | 120ms | ease-default |
| Element enter (fade-in) | 240ms | ease-out |
| Modal appear | 200ms scale+fade | ease-spring |
| Page transition | 160ms fade | ease-out |
| Drag-drop indicator | immediate | none |

**Reduced motion:** Add class `reduce-motion` to root `<div>`. CSS rule:
```css
.reduce-motion * { animation: none !important; transition: none !important; }
```
Read from `useAppStore` → `reducedMotion` setting.

---

## 7. Density System

Two density levels, toggled in Settings:

| Density | Class | Effect |
|---------|-------|--------|
| Comfortable (default) | `.density-comfortable` | Standard spacing — task rows 52px, list gaps 8px |
| Compact | `.density-compact` | Tighter — task rows 40px, list gaps 4px |

Apply both density and reduce-motion classes to the root div:
```tsx
<div className={`density-${density}${reducedMotion ? ' reduce-motion' : ''}`}>
```

---

## 8. Internationalization

### Static UI strings
- All UI text (button labels, headings, placeholders, tooltips) lives in `src/i18n/strings.ts`.
- Both `en` and `zh` entries are required for every key — no missing translations.
- Access via `useT()` hook: `const t = useT(); t('today.addTask')`

### Domain object text (LocalizedString)
- Task titles, descriptions, subtasks use `LocalizedString { en: string; zh?: string }`.
- Resolve with `useLocaleString()`: `const ls = useLocaleString(); ls(task.title)`
- Never render raw `task.title` — always resolve through the hook.
- When `zh` is missing and locale is `zh`, fall back to `en`.

### Language switching
- Controlled by `useAppStore` → `locale: 'en' | 'zh'`.
- Changing locale re-renders all consumer components immediately (Zustand reactivity).

---

## 9. Color Usage Rules

1. **No arbitrary hex in components.** Use CSS custom properties exclusively.
2. **Tailwind semantic classes are permitted** where they map to the token system (`bg-surface`, `text-text-primary`). Do not use raw Tailwind color classes (`bg-green-500`, `text-gray-300`).
3. **One-off decorative elements** (e.g., SVG gradient stops) may use `var(--accent-primary)` inline.
4. **Opacity modifiers** on tokens are acceptable: `rgba(var(--accent-primary-rgb), 0.1)` — but prefer the pre-defined `--accent-fog` / `--accent-glow` variables when they match.

---

## 10. Page-Level Layout Patterns

### Today Page
- Hero card at top (full width, gradient accent background).
- Secondary cards stack below with 12px gap.
- Compose bar pinned to bottom of content area.
- Empty state: centered breathing orb animation + call-to-action.

### Matrix Page
- Three layout variants: Classic (2×2 grid), List (4 vertical sections), Hybrid (Q1 wider column).
- Unclassified strip above the matrix — horizontal scroll if overflow.
- Quadrant boxes: equal flex weight in Classic; Q1 gets `flex: 2` in Hybrid.
- Drag-and-drop indicator: 2px accent-primary dashed border on target quadrant.

### Focus Page
- Full viewport canvas (topbar hidden, sidebar hidden).
- SVG progress ring centered, 240px diameter, 8px stroke.
- Ring stroke: `--accent-primary`. Track: `--border-subtle`.
- Timer in JetBrains Mono 64px below ring.
- Task title 18px, text-secondary, below timer.
- Controls: Pause / Complete / Abandon — ghost buttons, horizontally centered.

### Settings Page
- Left rail: section nav list (220px, matches sidebar width visually).
- Right: section content, max 640px, 24px top padding.
- Each section is a `<section>` with an `<h2>` heading.

### Auth Pages
- Split layout: left decorative hero (40% width, accent gradient), right form (60%).
- Form: max 380px, centered vertically.
- Logo + tagline above form fields.
- OAuth buttons before email/password fields.

---

## 11. Coding Conventions

| Rule | Detail |
|------|--------|
| CSS custom properties | Always `var(--token-name)`, never hardcoded hex |
| Component colors | CSS class or `var()`, never Tailwind arbitrary `[#hex]` |
| Inline styles | Layout values only (widths, flex ratios, dynamic pixel values) |
| Component structure | Types → hooks → render. No business logic in JSX. |
| Store calls | Only from store action hooks, never raw API calls from components |
| API calls | Only from Zustand store actions |
| LocalStorage | Never accessed directly in components — all through API layer |
| Comments | Only when WHY is non-obvious. No docblocks, no task references. |

---

## 12. Accessibility Baseline

- All interactive elements are keyboard-reachable (`tabIndex`, proper `<button>`/`<a>` elements).
- Focus rings use `outline: 2px solid var(--accent-edge); outline-offset: 2px`.
- Color is never the sole differentiator (quadrant dots also use shape/position context).
- `aria-label` required on icon-only buttons.
- `role="dialog"` + `aria-modal="true"` on modal panels.
