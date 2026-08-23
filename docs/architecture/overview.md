# Project Architecture

This document provides an overview of the lumo-task-web project architecture, technical stack, and design patterns.

## Project Overview

**lumo-task-web** is a full-stack task management application with:
- Modern web UI (React + TypeScript)
- Node.js/Hono REST API backend
- SQLite / libSQL (Turso) database via `@libsql/client`
- Electron desktop app (optional)
- Cross-platform support (Windows, macOS, Linux)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client Layer                      │
├─────────────────────────────────────────────────────┤
│  Web Browser (web-app/)  │  Electron Desktop App    │
│  ├─ React Components     │  └─ Electron + web-app   │
│  ├─ Zustand Store        │                          │
│  ├─ TypeScript           │                          │
│  └─ Vite (dev + build)   │                          │
└────────────────────┬─────────────────────────────────┘
                     │ HTTPS / HTTP
┌────────────────────▼─────────────────────────────────┐
│                    API Layer                         │
├─────────────────────────────────────────────────────┤
│  Node.js + Hono REST API (backend/)                 │
│  ├─ Route handlers with type safety                 │
│  ├─ Middleware (auth, CORS, error handling)         │
│  ├─ Input validation (Zod)                          │
│  └─ TypeScript + esbuild                            │
└────────────────────┬─────────────────────────────────┘
                     │ SQL
┌────────────────────▼─────────────────────────────────┐
│                    Data Layer                        │
├─────────────────────────────────────────────────────┤
│  SQLite / libSQL (Turso) via @libsql/client         │
│  ├─ Schema: users, tasks, projects, etc.            │
│  ├─ Parameterized queries (no SQL injection)        │
│  └─ Migrations (raw SQL in db/migrate.ts)           │
└─────────────────────────────────────────────────────┘
```

## Directory Structure

```
lumo-task-web/
├── web-app/                          # Frontend React application
│   ├── src/
│   │   ├── components/               # React components
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskForm.tsx
│   │   │   └── __tests__/            # Component tests
│   │   ├── pages/                    # Page components
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── store/                    # Zustand stores
│   │   │   ├── taskStore.ts
│   │   │   ├── userStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── api/                      # API client
│   │   │   ├── client.ts             # HTTP client (fetch-based)
│   │   │   └── hooks.ts              # API query hooks
│   │   ├── types/                    # TypeScript type definitions
│   │   │   ├── task.ts
│   │   │   ├── user.ts
│   │   │   └── api.ts
│   │   ├── i18n/                     # Internationalization
│   │   │   └── strings.ts            # EN + ZH translations
│   │   ├── styles/                   # Global styles
│   │   │   └── index.css             # CSS tokens: bg-, text-, var(--*)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/                       # Static assets
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── playwright.config.ts
│
├── backend/                          # Node.js REST API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── tasks.ts              # GET, POST, PATCH, DELETE /tasks
│   │   │   ├── users.ts              # User management endpoints
│   │   │   ├── auth.ts               # Login, register, logout
│   │   │   └── health.ts             # Health check
│   │   ├── middleware/
│   │   │   └── auth.ts               # JWT authentication (CORS + global onError live in app.ts)
│   │   ├── db/
│   │   │   ├── client.ts             # @libsql/client + query/queryOne/execute/batch helpers
│   │   │   ├── migrate.ts            # Table definitions + migrations (raw SQL)
│   │   │   ├── schema.ts             # Column-name/type reference doc only (no ORM)
│   │   │   ├── rows.ts               # Row → wire-shape mappers
│   │   │   └── dbConfig.ts           # Operating-mode selection (local / replica / cloud)
│   │   ├── lib/                      # errors, jwt, crypto, rateLimit, ssrf, cursor, ai-*, ics, …
│   │   │   ├── errors.ts             # httpError() + error codes
│   │   │   ├── jwt.ts                # JWT token generation
│   │   │   └── validate.ts           # Zod zValidator wrappers
│   │   ├── app.ts                    # Hono app initialization
│   │   └── index.ts                  # Entry point
│   ├── src/test/
│   │   ├── api/                      # In-process API endpoint tests (node --test)
│   │   ├── security/                 # authn / authz / input / secrets / rate-limit
│   │   ├── standards/                # error-shape + contract-first guards
│   │   ├── integration.test.ts       # real-HTTP integration
│   │   └── dfx.integration.test.ts   # daily DFX regression (security/robustness/…)
│   ├── package.json
│   ├── tsconfig.json
│   └── tsconfig.build.json
│
├── .github/
│   ├── workflows/                    # GitHub Actions
│   │   ├── ci.yml                    # Main CI pipeline
│   │   ├── auto-triage.yml           # Auto-classify issues
│   │   ├── update-changelog.yml      # Auto-update CHANGELOG
│   │   └── release.yml               # Publish releases
│   ├── ISSUE_TEMPLATE/               # Issue templates
│   ├── CONTRIBUTING.md               # Contribution guide
│   ├── BRANCH_PROTECTION.md          # Branch protection rules
│   ├── PR_REVIEW_CHECKLIST.md        # Code review standards
│   ├── adr/                          # Architecture decision records
│   └── labels.json                   # GitHub labels definition
│
├── .claude/
│   ├── settings.json                 # Claude Code configuration
│   ├── commands/                     # Custom Claude Code commands
│   └── hooks/                        # Pre/post-commit hooks
│
├── CLAUDE.md                         # Engineering standards
├── docs/architecture/overview.md                   # This file
├── CHANGELOG.md                      # Release notes
├── README.md                         # Project overview
└── Makefile                          # Convenience commands
```

## Technology Stack

### Frontend (web-app/)

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | Latest |
| Framework | React | 18+ |
| Build Tool | Vite | Latest |
| State Mgmt | Zustand | Latest |
| UI Components | Native HTML + Tailwind CSS | - |
| Testing | Vitest + React Testing Library | Latest |
| E2E Testing | Playwright | Latest |
| HTTP Client | Fetch API (native) | - |
| i18n | Custom (EN + ZH) | - |

### Backend (backend/)

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | Latest |
| Framework | Hono | Latest |
| Database | SQLite / libSQL (Turso) via `@libsql/client` | 0.17.x |
| Data access | Raw parameterized SQL (`:name` args) — **no ORM**; business logic lives in route handlers, not a service layer | - |
| Validation | Zod | Latest |
| Auth | JWT (HS256) | - |
| Testing | Node --test + Vitest | Latest |
| Build Tool | esbuild | Latest |

### DevOps & Deployment

| Component | Technology |
|-----------|-----------|
| CI/CD | GitHub Actions |
| API Deployment | Render (web service) |
| Frontend Deployment | Render (static site) |
| Secrets Management | GitHub Actions secrets |
| Monitoring | Application logs (stdout/stderr) |
| Code Quality | TypeScript, ESLint, Prettier |

---

## Data Flow

### User Authentication Flow

```
User Input (login form)
  ↓
fetch POST /api/auth/login (email, password)
  ↓
Backend: userService.authenticate(email, password)
  ↓
Hash & verify password against DB
  ↓
Generate JWT token
  ↓
Response: { user: {...}, token: "jwt..." }
  ↓
Frontend: Store token in localStorage
  ↓
Set Authorization header for future requests
```

### Task Creation Flow

```
User Action (create task form)
  ↓
React Component State → Zustand Action
  ↓
fetch POST /api/tasks (title, description, ...)
  ↓
Request Header: Authorization: Bearer <JWT>
  ↓
Backend Middleware: Verify JWT → Attach user to ctx
  ↓
Backend Route: POST /tasks
  ↓
Validate input (Zod schema)
  ↓
Insert into DB: INSERT INTO tasks (user_id, title, ...) VALUES (...)
  ↓
Return: { task: {...}, message: "Task created" }
  ↓
Frontend: Update Zustand store with new task
  ↓
UI re-renders with new task
```

---

## Key Design Patterns

### Frontend Patterns

#### 1. Component Architecture
```
Page Component (e.g., TaskPage.tsx)
  ├─ Container Component (handles data fetching)
  └─ Presentational Components (dumb, only receive props)
      ├─ TaskList
      ├─ TaskItem
      └─ TaskForm
```

#### 2. State Management
- **Zustand** for global state (user, tasks, settings, filters)
- **React hooks** for local component state
- **Custom hooks** for reusable logic (useTask, useAuth)

#### 3. API Integration
- Centralized client (`src/api/client.ts`)
- Custom hooks for queries (`useGetTasks`, `useCreateTask`)
- Automatic token injection via interceptors
- Error handling via ErrorBoundary

#### 4. Type Safety
- All types in `src/types/` (never redefine Task, User, etc.)
- API types match backend response shape
- Component props fully typed (`interface Props {}`)

### Backend Patterns

#### 1. Route Organization
```
routes/
  ├─ auth.ts      → POST /api/auth/login, POST /api/auth/register
  ├─ tasks.ts     → GET, POST, PATCH, DELETE /api/tasks
  └─ users.ts     → GET, PATCH /api/users/:id
```

#### 2. Middleware Stack
```
Hono App
  ├─ corsMiddleware()
  ├─ authMiddleware() → Attach user to ctx
  ├─ errorHandler() → Catch and format errors
  └─ Routes
```

#### 3. Error Handling
```typescript
// All errors use consistent format
{
  error: {
    code: "VALIDATION_ERROR" | "AUTH_FAILED" | "NOT_FOUND",
    message: "User-friendly error message"
  }
}
```

#### 4. Input Validation
```typescript
// Every route validates input with Zod
const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high'])
});

// Usage in route
const body = await req.json();
const data = createTaskSchema.parse(body); // Throws if invalid
```

#### 5. Database Access
```typescript
// Raw parameterized SQL via the db/client.ts helpers — no ORM.
// `:name` bind args are the only interpolation; user_id always re-scopes the query.
import { query, queryOne, execute, batch } from "../db/client.js";

const tasks = await query(
  'SELECT * FROM tasks WHERE user_id = :uid AND completed = 0 AND deleted_at IS NULL',
  { uid }
);

// Multi-statement writes go through batch() for atomicity:
await batch([
  { sql: 'UPDATE tasks SET completed = 1, updated_at = :now WHERE id = :id', args: { id, now } },
]);
```

---

## Testing Strategy

### Frontend Testing

| Type | Tool | Location | Examples |
|------|------|----------|----------|
| Unit | Vitest + RTL | `src/**/__tests__/*.test.tsx` | Component renders, hooks behavior |
| Integration | Vitest + RTL | `src/**/__tests__/*.integration.tsx` | Component + store interaction |
| E2E | Playwright | `web-app/e2e/**/*.spec.ts` | Full user flows (login → create task) |

**Coverage Target**: New components 100% of public behavior, overall ≥ 70%

### Backend Testing

| Type | Tool | Location | Examples |
|------|------|----------|----------|
| Unit | Node --test | `backend/__tests__/units/` | Service logic, validation |
| Integration | Node --test | `backend/__tests__/integration/` | API endpoints with real DB |
| E2E | Node --test | `backend/__tests__/e2e/` | Full flows with real HTTP |

**Coverage Target**: New code ≥ 80%, critical paths 100%

---

## Performance Considerations

### Frontend
- **Code splitting**: Route-based lazy loading with React.lazy()
- **Bundle size**: Monitor via Vite build analysis
- **Re-renders**: Proper dependency arrays in useEffect
- **Images**: Optimize with WebP, lazy loading

### Backend
- **Database indexes**: On user_id, created_at, status columns
- **Query optimization**: Avoid N+1 queries with joins
- **Caching**: Redis (if needed) for session/token cache
- **Rate limiting**: On auth and expensive endpoints

---

## Security Considerations

### Authentication & Authorization
- JWT tokens (HS256) stored in localStorage
- Tokens expire after 24 hours
- Refresh tokens for silent re-auth (if implemented)
- User can only access their own data

### API Security
- Input validation (Zod) at every endpoint
- CORS enabled only for trusted origins
- CSRF protection via SameSite cookies (if applicable)
- No API keys in responses (only `hasKey: boolean`)

### Data Protection
- Passwords hashed with bcrypt (backend)
- Sensitive data not logged
- SQL parameterized queries
- HTTPS only in production

---

## Deployment Architecture

### Development
```
Local machine
  ├─ npm run dev (Vite dev server on :5173)
  └─ npm run dev (Hono server on :3000)
```

### Production

#### Frontend
```
Render (static site + CDN)
  ├─ Static assets (JS, CSS, images)
  └─ SPA fallback: rewrites all routes to index.html
```

#### Backend
```
Render (Node.js web service / container)
  ├─ Hono REST API
  ├─ SQLite database (Turso libsql for persistence)
  └─ Environment variables from the Render dashboard / render.yaml
```

#### Deployment Flow
```
git push to main
  ↓
GitHub Actions CI pipeline
  ├─ Run tests & type checks
  ├─ Build artifacts
  └─ On success: Render auto-deploys frontend + backend
```

---

## Related Documents

- **[CLAUDE.md](/CLAUDE.md)** - Engineering standards and mandatory rules
- **[CONTRIBUTING.md](../../.github/CONTRIBUTING.md)** - How to contribute
- **[Architecture Decision Records](adr/)** - Why we chose specific technologies
- **[PR Review Checklist](../../.github/PR_REVIEW_CHECKLIST.md)** - Code review standards

---

## Future Improvements

### Scalability
- [ ] Add Redis for caching (user sessions, frequently accessed tasks)
- [ ] Database read replicas for scaling reads
- [ ] GraphQL layer (if REST API becomes bottleneck)

### Features
- [ ] Real-time collaboration (WebSockets)
- [ ] File attachments (S3 / Cloud Storage)
- [ ] Task templates and automation
- [ ] Analytics and insights dashboard

### DevOps
- [ ] Kubernetes deployment (if scaling)
- [ ] Database backup and disaster recovery plan
- [ ] APM (Application Performance Monitoring)
- [ ] Centralized logging (ELK Stack / Datadog)

---

## Contact & Questions

For architecture questions or discussions, please:
1. Open an issue with `question` label
2. Refer to existing ADRs in `.github/adr/`
3. Check CLAUDE.md for specific constraints
