import { z } from "zod";
import {
  TaskCreateBodySchema,
  TaskUpdateBodySchema,
  TaskListQuerySchema,
  TaskWireSchema,
  TaskListResponseSchema,
  TaskCompleteResponseSchema,
} from "./task.js";
import {
  PersonCreateBodySchema,
  PersonUpdateBodySchema,
  PersonWireSchema,
  PersonListResponseSchema,
} from "./person.js";
import {
  ProjectCreateBodySchema,
  ProjectUpdateBodySchema,
  ProjectMigrateBodySchema,
  ProjectMigrateResponseSchema,
  ProjectWireSchema,
  ProjectListResponseSchema,
} from "./project.js";
import {
  HabitCreateBodySchema,
  HabitUpdateBodySchema,
  HabitLogBodySchema,
  HabitMigrateBodySchema,
  HabitMigrateResponseSchema,
  HabitWireSchema,
  HabitLogWireSchema,
  HabitListResponseSchema,
} from "./habit.js";
import {
  CountdownCreateBodySchema,
  CountdownUpdateBodySchema,
  CountdownMigrateBodySchema,
  CountdownMigrateResponseSchema,
  CountdownWireSchema,
  CountdownListResponseSchema,
} from "./countdown.js";
import {
  TemplateCreateBodySchema,
  TemplateUpdateBodySchema,
  TemplateWireSchema,
} from "./template.js";
import {
  RegisterBodySchema,
  SigninBodySchema,
  BindEmailBodySchema,
  BindEmailResponseSchema,
  RecoveryResetBodySchema,
  ChangePasswordBodySchema,
  RefreshBodySchema,
  RefreshResponseSchema,
  RecoveryCodeResponseSchema,
  ForgotPasswordBodySchema,
  ResetPasswordBodySchema,
  VerifyEmailBodySchema,
  GithubExchangeBodySchema,
  AuthSessionWireSchema,
  AuthOkResponseSchema,
} from "./auth.js";
import {
  UserProfileWireSchema,
  DataExportWireSchema,
  DeleteAccountResponseSchema,
} from "./user.js";
import { SettingsPatchBodySchema, SettingsWireSchema } from "./settings.js";
import {
  FocusSessionBodySchema,
  FocusSessionResponseSchema,
  CompletedListResponseSchema,
  CompletedDayResponseSchema,
  ReopenResponseSchema,
} from "./focus.js";
import { StorageInfoWireSchema } from "./storage.js";
import {
  BreakdownRequestSchema,
  BreakdownResponseSchema,
  ClassifyRequestSchema,
  ClassifyResponseSchema,
  RecommendRequestSchema,
  RecommendResponseSchema,
  ParseRequestSchema,
  ParseResponseSchema,
  ChatRequestSchema,
  ChatResponseSchema,
} from "./ai.js";
import { CalendarFeedResponseSchema } from "./calendar.js";
import {
  SyncPullRequestSchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  SyncPushResponseSchema,
  SyncStatusResponseSchema,
  SyncCycleResponseSchema,
} from "./sync.js";
import {
  CreateFeedbackBodySchema,
  CreateFeedbackResponseSchema,
  FeedbackListResponseSchema,
  UpdateFeedbackObjectSchema,
  AdminFeedbackListResponseSchema,
  AdminFeedbackUpdateResponseSchema,
} from "./feedback.js";

/**
 * The API route registry — the single, executable description of the Lumo HTTP
 * surface.
 *
 * Why this exists
 * ---------------
 * "Contract-First" used to stop at the *schema* level: bodies lived in this
 * package, but the list of endpoints lived in three places that disagreed —
 * a hand-written OpenAPI document in `backend/src/routes/docs.ts`, a stale
 * `docs/openapi.yaml`, and the actual Hono router. Design and runtime drifted
 * silently; the published spec covered well under half the live surface.
 *
 * This registry collapses those into one. It is:
 *
 *   • the source the OpenAPI document is generated from
 *     ({@link buildOpenApiDocument}), served live at `GET /docs/openapi.json`
 *     and written to `docs/api/openapi.json`; and
 *   • the source a **parity test** diffs against the real mounted Hono routes
 *     (`backend/src/test/standards/api-registry.standards.test.ts`).
 *
 * The parity test fails in BOTH directions, which is what makes design ≡
 * runtime an enforced property rather than an aspiration: an endpoint added to
 * the router without a registry entry fails, and a registry entry with no live
 * route fails too.
 *
 * Adding an endpoint therefore means: schema here → entry here → route in the
 * backend → consumer in the frontend. In that order.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

/**
 * How a request proves who it is.
 *  • `public` — no credential (health, sign-in, OAuth handshake).
 *  • `bearer` — `Authorization: Bearer <JWT>`, enforced by `authMiddleware`.
 *  • `admin`  — `bearer` plus the admin allow-list (`requireAdmin`).
 *  • `feed-token` — an unguessable per-user token in the query string, used by
 *    calendar subscribers (Google/Apple Calendar cannot send an auth header).
 */
export type AuthMode = "public" | "bearer" | "admin" | "feed-token";

export interface ResponseDef {
  status: number;
  description: string;
  /** Omit for empty bodies or non-JSON payloads (see `contentType`). */
  schema?: z.ZodTypeAny;
  /** Defaults to `application/json`. */
  contentType?: string;
}

export interface RouteDef {
  method: HttpMethod;
  /**
   * The path EXACTLY as mounted on the Hono app, colon-style params included
   * (`/v1/tasks/:id`). This is the key the parity test compares, so it must
   * match the router literally; {@link buildOpenApiDocument} converts it to
   * OpenAPI's `{id}` form.
   */
  path: string;
  /** Groups endpoints in the rendered docs. */
  tag: string;
  summary: string;
  description?: string;
  auth: AuthMode;
  /** JSON request-body schema, for methods that take one. */
  request?: z.ZodTypeAny;
  /** Query-string schema, where the route validates one. */
  query?: z.ZodTypeAny;
  /**
   * Success + notable failure responses. The universal envelope failures (401
   * unauthenticated, 400 validation, 500 internal) are appended automatically
   * by the generator, so list only what is specific to this endpoint.
   */
  responses: ResponseDef[];
}

// ── Shared response fragments ─────────────────────────────────────────────────

const ok = (description: string, schema?: z.ZodTypeAny): ResponseDef => ({
  status: 200,
  description,
  schema,
});
const created = (description: string, schema?: z.ZodTypeAny): ResponseDef => ({
  status: 201,
  description,
  schema,
});
const noContent = (description: string): ResponseDef => ({ status: 204, description });
const notFound = (description = "Resource not found, or not owned by the caller"): ResponseDef => ({
  status: 404,
  description,
});

// ── The registry ──────────────────────────────────────────────────────────────

/** Infrastructure endpoints — unauthenticated, used by probes and operators. */
const infraRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/health",
    tag: "Infrastructure",
    summary: "Liveness probe",
    description:
      "Is the process up? Deliberately shallow — no DB call — because this is what the " +
      "platform health check polls; coupling it to the database would let a transient DB " +
      "blip restart-loop an otherwise-healthy instance. Use /ready for dependency health.",
    auth: "public",
    responses: [ok("Process is alive", z.object({ ok: z.literal(true) }))],
  },
  {
    method: "get",
    path: "/ready",
    tag: "Infrastructure",
    summary: "Readiness probe",
    description:
      "Can the process actually serve traffic (database reachable)? For load-balancer " +
      "draining and external monitoring.",
    auth: "public",
    responses: [
      ok("Ready to serve", z.object({ ok: z.literal(true), db: z.literal("up") })),
      {
        status: 503,
        description: "Database unreachable — do not route traffic here",
        schema: z.object({ ok: z.literal(false), db: z.literal("down") }),
      },
    ],
  },
  {
    method: "get",
    path: "/status",
    tag: "Infrastructure",
    summary: "Public status page",
    description:
      "A dependency-free HTML page that polls /health and /ready from the same origin. " +
      "Served by the backend itself, so it reports a degraded database while the process " +
      "is up; full-outage detection is the external uptime monitor's job.",
    auth: "public",
    responses: [ok("HTML status page", undefined)],
  },
  {
    method: "get",
    path: "/metrics",
    tag: "Infrastructure",
    summary: "Prometheus metrics",
    description:
      "Request volume, latency histograms, and in-flight concurrency. Disabled unless " +
      "LUMO_METRICS_TOKEN is set; when set, requires a matching Bearer token.",
    auth: "bearer",
    responses: [
      { status: 200, description: "Prometheus text exposition", contentType: "text/plain" },
      { status: 404, description: "Metrics disabled (LUMO_METRICS_TOKEN unset)" },
    ],
  },
  {
    method: "get",
    path: "/docs",
    tag: "Infrastructure",
    summary: "Swagger UI",
    auth: "public",
    responses: [ok("Interactive API explorer", undefined)],
  },
  {
    method: "get",
    path: "/docs/openapi.json",
    tag: "Infrastructure",
    summary: "OpenAPI document",
    description: "Generated from this registry — never hand-edited.",
    auth: "public",
    responses: [ok("OpenAPI 3.0.3 document", undefined)],
  },
];

const authRoutes: RouteDef[] = [
  {
    method: "post",
    path: "/v1/auth/register",
    tag: "Auth",
    summary: "Create an account",
    description:
      "Username-only registration; email is bound later. The one-time recovery code in " +
      "the response is returned EXACTLY once and is never recoverable afterwards.",
    auth: "public",
    request: RegisterBodySchema,
    responses: [
      created("Account created; session issued", AuthSessionWireSchema),
      { status: 409, description: "Username already taken" },
      { status: 429, description: "Rate limited (10 auth attempts / IP / minute)" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/signin",
    tag: "Auth",
    summary: "Sign in",
    auth: "public",
    request: SigninBodySchema,
    responses: [
      ok("Session issued", AuthSessionWireSchema),
      {
        status: 401,
        description:
          "Invalid credentials. Identical for an unknown username and a wrong password, " +
          "and the handler spends equivalent bcrypt time in both cases, so neither the " +
          "response nor its latency can enumerate accounts.",
      },
      { status: 429, description: "Rate limited" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/refresh",
    tag: "Auth",
    summary: "Exchange a refresh token for a new session",
    description: "Refresh tokens are single-use: the old token is revoked as the new pair is issued.",
    auth: "public",
    request: RefreshBodySchema,
    responses: [
      ok("New access + refresh token", RefreshResponseSchema),
      { status: 401, description: "Refresh token unknown, expired, or already used" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/signout",
    tag: "Auth",
    summary: "Sign out",
    description: "Revokes the caller's refresh tokens.",
    auth: "bearer",
    responses: [ok("Signed out", AuthOkResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/auth/change-password",
    tag: "Auth",
    summary: "Change password",
    description: "Invalidates every existing session for the account.",
    auth: "bearer",
    request: ChangePasswordBodySchema,
    responses: [
      ok("Password changed; all sessions invalidated", AuthOkResponseSchema),
      { status: 401, description: "Current password incorrect" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/bind-email",
    tag: "Auth",
    summary: "Bind or change the account email",
    description:
      "The address is stored UNVERIFIED and a verification link is sent. An unverified " +
      "or absent email never blocks usage.",
    auth: "bearer",
    request: BindEmailBodySchema,
    responses: [
      ok("Email bound (unverified); verification sent", BindEmailResponseSchema),
      { status: 409, description: "Another account already owns that address" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/forgot-password",
    tag: "Auth",
    summary: "Request a password-reset email",
    description:
      "Always returns 200 whether or not the address exists — a distinguishable response " +
      "would turn this endpoint into an account-enumeration oracle.",
    auth: "public",
    request: ForgotPasswordBodySchema,
    responses: [ok("Accepted (response is identical for unknown addresses)", AuthOkResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/auth/reset-password",
    tag: "Auth",
    summary: "Complete a password reset",
    auth: "public",
    request: ResetPasswordBodySchema,
    responses: [
      ok("Password reset; all sessions invalidated", AuthOkResponseSchema),
      { status: 400, description: "Reset token invalid, expired, or already consumed" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/recovery/reset",
    tag: "Auth",
    summary: "Reset a password using the one-time recovery code",
    description: "The offline fallback for accounts with no bound email. Consumes the code.",
    auth: "public",
    request: RecoveryResetBodySchema,
    responses: [
      ok("Password reset; recovery code consumed", AuthOkResponseSchema),
      { status: 401, description: "Username/code pair not valid" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/recovery-code/regenerate",
    tag: "Auth",
    summary: "Issue a fresh recovery code",
    description: "Invalidates the previous code. The plaintext is returned exactly once.",
    auth: "bearer",
    responses: [ok("New one-time recovery code", RecoveryCodeResponseSchema)],
  },
  {
    method: "get",
    path: "/v1/auth/verify-email",
    tag: "Auth",
    summary: "Verify an email from the link in the message",
    description: "Browser entry point — consumes the token and redirects into the app.",
    auth: "public",
    responses: [{ status: 302, description: "Redirect into the app with the result" }],
  },
  {
    method: "post",
    path: "/v1/auth/verify-email",
    tag: "Auth",
    summary: "Verify an email programmatically",
    auth: "public",
    request: VerifyEmailBodySchema,
    responses: [
      ok("Email verified", AuthOkResponseSchema),
      { status: 400, description: "Verification token invalid, expired, or already consumed" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/resend-verification",
    tag: "Auth",
    summary: "Resend the verification email",
    auth: "bearer",
    responses: [ok("Verification email sent", AuthOkResponseSchema)],
  },
];

const oauthRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/auth/github/config",
    tag: "Auth",
    summary: "Is GitHub sign-in available?",
    description: "Lets the client hide the button when the deployment has no GitHub app configured.",
    auth: "public",
    responses: [ok("Availability flag", z.object({ enabled: z.boolean() }))],
  },
  {
    method: "get",
    path: "/v1/auth/github/start",
    tag: "Auth",
    summary: "Begin the GitHub OAuth handshake",
    auth: "public",
    responses: [{ status: 302, description: "Redirect to GitHub's consent screen" }],
  },
  {
    method: "get",
    path: "/v1/auth/github/callback",
    tag: "Auth",
    summary: "GitHub OAuth callback",
    description: "Validates the state parameter, then redirects back into the app with a one-time code.",
    auth: "public",
    responses: [{ status: 302, description: "Redirect into the app" }],
  },
  {
    method: "post",
    path: "/v1/auth/github/exchange",
    tag: "Auth",
    summary: "Exchange the one-time OAuth code for a session",
    auth: "public",
    request: GithubExchangeBodySchema,
    responses: [
      ok("Session issued", AuthSessionWireSchema),
      { status: 401, description: "Code unknown, expired, or already used" },
    ],
  },
  {
    method: "post",
    path: "/v1/auth/github/link",
    tag: "Auth",
    summary: "Link a GitHub identity to the signed-in account",
    auth: "bearer",
    responses: [
      ok("GitHub identity linked", AuthOkResponseSchema),
      { status: 409, description: "That GitHub identity is already linked elsewhere" },
    ],
  },
];

const userRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/user",
    tag: "User",
    summary: "Get the signed-in user's profile and usage stats",
    auth: "bearer",
    responses: [ok("Profile", UserProfileWireSchema)],
  },
  {
    method: "get",
    path: "/v1/user/export",
    tag: "User",
    summary: "Export all of the caller's data (GDPR/CCPA)",
    description:
      "Secret-bearing fields are never exported: AI keys and sync tokens are replaced by a " +
      "boolean flag, and the identity block omits the password hash and calendar-feed tokens.",
    auth: "bearer",
    responses: [
      ok("Complete data bundle", DataExportWireSchema),
      { status: 429, description: "Rate limited — the export is expensive to build" },
    ],
  },
  {
    method: "delete",
    path: "/v1/user",
    tag: "User",
    summary: "Delete the account and every row it owns",
    description:
      "Irreversible right-to-erasure. The caller's tokens stop working immediately because " +
      "the user row backing them is gone.",
    auth: "bearer",
    responses: [
      ok("Account erased", DeleteAccountResponseSchema),
      { status: 429, description: "Rate limited" },
    ],
  },
];

const taskRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/tasks",
    tag: "Tasks",
    summary: "List tasks",
    description: "Keyset-paginated. Page through until `nextCursor` is null.",
    auth: "bearer",
    query: TaskListQuerySchema,
    responses: [ok("A page of tasks", TaskListResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/tasks",
    tag: "Tasks",
    summary: "Create a task",
    auth: "bearer",
    request: TaskCreateBodySchema,
    responses: [created("The created task", TaskWireSchema)],
  },
  {
    method: "get",
    path: "/v1/tasks/:id",
    tag: "Tasks",
    summary: "Get one task",
    auth: "bearer",
    responses: [ok("The task", TaskWireSchema), notFound()],
  },
  {
    method: "patch",
    path: "/v1/tasks/:id",
    tag: "Tasks",
    summary: "Update a task",
    auth: "bearer",
    request: TaskUpdateBodySchema,
    responses: [ok("The updated task", TaskWireSchema), notFound()],
  },
  {
    method: "delete",
    path: "/v1/tasks/:id",
    tag: "Tasks",
    summary: "Delete a task",
    description: "Soft delete — the row is tombstoned so the deletion propagates through sync.",
    auth: "bearer",
    responses: [noContent("Deleted"), notFound()],
  },
  {
    method: "post",
    path: "/v1/tasks/:id/complete",
    tag: "Tasks",
    summary: "Complete a task",
    description: "Writes a completion-history entry and advances any recurrence rule.",
    auth: "bearer",
    responses: [ok("Completion result", TaskCompleteResponseSchema), notFound()],
  },
  {
    method: "post",
    path: "/v1/tasks/:id/uncomplete",
    tag: "Tasks",
    summary: "Re-open a completed task",
    auth: "bearer",
    responses: [ok("The re-opened task", TaskWireSchema), notFound()],
  },
];

const peopleRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/people",
    tag: "People",
    summary: "List people",
    auth: "bearer",
    responses: [ok("A page of people", PersonListResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/people",
    tag: "People",
    summary: "Create a person",
    auth: "bearer",
    request: PersonCreateBodySchema,
    responses: [created("The created person", PersonWireSchema)],
  },
  {
    method: "patch",
    path: "/v1/people/:id",
    tag: "People",
    summary: "Update a person",
    auth: "bearer",
    request: PersonUpdateBodySchema,
    responses: [ok("The updated person", PersonWireSchema), notFound()],
  },
  {
    method: "delete",
    path: "/v1/people/:id",
    tag: "People",
    summary: "Delete a person",
    auth: "bearer",
    responses: [noContent("Deleted"), notFound()],
  },
];

const projectRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/projects",
    tag: "Projects",
    summary: "List projects",
    description:
      "Keyset-paginated. Each project may carry up to 1 MB of rich-text content, so " +
      "pagination is what bounds the response size on a content-heavy account.",
    auth: "bearer",
    responses: [ok("A page of projects", ProjectListResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/projects",
    tag: "Projects",
    summary: "Create a project",
    auth: "bearer",
    request: ProjectCreateBodySchema,
    responses: [created("The created project", ProjectWireSchema)],
  },
  {
    method: "patch",
    path: "/v1/projects/:id",
    tag: "Projects",
    summary: "Update a project",
    auth: "bearer",
    request: ProjectUpdateBodySchema,
    responses: [ok("The updated project", ProjectWireSchema), notFound()],
  },
  {
    method: "delete",
    path: "/v1/projects/:id",
    tag: "Projects",
    summary: "Delete a project",
    auth: "bearer",
    responses: [noContent("Deleted"), notFound()],
  },
  {
    method: "post",
    path: "/v1/projects/migrate",
    tag: "Projects",
    summary: "Bulk-import projects from a local-only account",
    auth: "bearer",
    request: ProjectMigrateBodySchema,
    responses: [ok("Import summary", ProjectMigrateResponseSchema)],
  },
];

const habitRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/habits",
    tag: "Habits",
    summary: "List habits",
    auth: "bearer",
    responses: [ok("A page of habits", HabitListResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/habits",
    tag: "Habits",
    summary: "Create a habit",
    auth: "bearer",
    request: HabitCreateBodySchema,
    responses: [created("The created habit", HabitWireSchema)],
  },
  {
    method: "patch",
    path: "/v1/habits/:id",
    tag: "Habits",
    summary: "Update a habit",
    auth: "bearer",
    request: HabitUpdateBodySchema,
    responses: [ok("The updated habit", HabitWireSchema), notFound()],
  },
  {
    method: "delete",
    path: "/v1/habits/:id",
    tag: "Habits",
    summary: "Delete a habit",
    auth: "bearer",
    responses: [noContent("Deleted"), notFound()],
  },
  {
    method: "get",
    path: "/v1/habits/logs",
    tag: "Habits",
    summary: "List habit completion logs",
    auth: "bearer",
    responses: [ok("Completion log rows", z.array(HabitLogWireSchema))],
  },
  {
    method: "post",
    path: "/v1/habits/:id/log",
    tag: "Habits",
    summary: "Mark a habit done on a given day",
    auth: "bearer",
    request: HabitLogBodySchema,
    responses: [created("The log entry", HabitLogWireSchema), notFound()],
  },
  {
    method: "delete",
    path: "/v1/habits/:id/log/:date",
    tag: "Habits",
    summary: "Un-mark a habit for a given day",
    auth: "bearer",
    responses: [noContent("Log entry removed"), notFound()],
  },
  {
    method: "post",
    path: "/v1/habits/migrate",
    tag: "Habits",
    summary: "Bulk-import habits and logs from a local-only account",
    auth: "bearer",
    request: HabitMigrateBodySchema,
    responses: [ok("Import summary", HabitMigrateResponseSchema)],
  },
];

const countdownRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/countdowns",
    tag: "Countdowns",
    summary: "List countdown events",
    auth: "bearer",
    responses: [ok("A page of countdowns", CountdownListResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/countdowns",
    tag: "Countdowns",
    summary: "Create a countdown event",
    auth: "bearer",
    request: CountdownCreateBodySchema,
    responses: [created("The created countdown", CountdownWireSchema)],
  },
  {
    method: "patch",
    path: "/v1/countdowns/:id",
    tag: "Countdowns",
    summary: "Update a countdown event",
    auth: "bearer",
    request: CountdownUpdateBodySchema,
    responses: [ok("The updated countdown", CountdownWireSchema), notFound()],
  },
  {
    method: "delete",
    path: "/v1/countdowns/:id",
    tag: "Countdowns",
    summary: "Delete a countdown event",
    auth: "bearer",
    responses: [noContent("Deleted"), notFound()],
  },
  {
    method: "post",
    path: "/v1/countdowns/migrate",
    tag: "Countdowns",
    summary: "Bulk-import countdowns from a local-only account",
    auth: "bearer",
    request: CountdownMigrateBodySchema,
    responses: [ok("Import summary", CountdownMigrateResponseSchema)],
  },
];

const templateRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/templates",
    tag: "Templates",
    summary: "List templates",
    auth: "bearer",
    responses: [ok("Templates", z.array(TemplateWireSchema))],
  },
  {
    method: "post",
    path: "/v1/templates",
    tag: "Templates",
    summary: "Create a template",
    auth: "bearer",
    request: TemplateCreateBodySchema,
    responses: [created("The created template", TemplateWireSchema)],
  },
  {
    method: "patch",
    path: "/v1/templates/:id",
    tag: "Templates",
    summary: "Update a template",
    auth: "bearer",
    request: TemplateUpdateBodySchema,
    responses: [ok("The updated template", TemplateWireSchema), notFound()],
  },
  {
    method: "delete",
    path: "/v1/templates/:id",
    tag: "Templates",
    summary: "Delete a template",
    auth: "bearer",
    responses: [noContent("Deleted"), notFound()],
  },
];

const focusRoutes: RouteDef[] = [
  {
    method: "post",
    path: "/v1/focus/sessions",
    tag: "Focus",
    summary: "Record a completed focus session",
    description: "Appends an entry to completion history. Duration is capped at 1440 minutes (24h).",
    auth: "bearer",
    request: FocusSessionBodySchema,
    responses: [ok("Session recorded", FocusSessionResponseSchema)],
  },
  {
    method: "get",
    path: "/v1/completed",
    tag: "Focus",
    summary: "List completion history",
    description:
      "Two shapes, selected by the query string: `?date=YYYY-MM-DD` returns a bare array " +
      "for that day (inherently bounded); with no `date` it returns the keyset-paginated " +
      "`{ items, nextCursor }` envelope over the full history.",
    auth: "bearer",
    query: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.number().int().optional(),
      cursor: z.string().optional(),
    }),
    responses: [
      ok("A page of history, or a single day's array", CompletedListResponseSchema),
      { status: 400, description: "`date` is not in YYYY-MM-DD format" },
    ],
  },
  {
    method: "post",
    path: "/v1/completed/:id/reopen",
    tag: "Focus",
    summary: "Re-open a completed entry",
    auth: "bearer",
    responses: [ok("Re-opened", ReopenResponseSchema), notFound()],
  },
];

const settingsRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/settings",
    tag: "Settings",
    summary: "Get the caller's settings",
    description:
      "AI provider credentials are never returned — each provider reports `hasKey: boolean` only.",
    auth: "bearer",
    responses: [ok("Settings", SettingsWireSchema), notFound("Settings row missing")],
  },
  {
    method: "patch",
    path: "/v1/settings",
    tag: "Settings",
    summary: "Update settings",
    description: "`ai_configs_update` is the write-only lane for provider credentials.",
    auth: "bearer",
    request: SettingsPatchBodySchema,
    responses: [ok("The updated settings", SettingsWireSchema)],
  },
];

const aiRoutes: RouteDef[] = [
  {
    method: "post",
    path: "/v1/ai/classify",
    tag: "AI",
    summary: "Suggest Eisenhower quadrants for unclassified tasks",
    description: "Input-free: operates on the caller's own unclassified tasks.",
    auth: "bearer",
    request: ClassifyRequestSchema,
    responses: [
      ok("Quadrant suggestions", ClassifyResponseSchema),
      { status: 429, description: "Rate limited" },
    ],
  },
  {
    method: "post",
    path: "/v1/ai/recommend",
    tag: "AI",
    summary: "Recommend the single next task",
    description: "Falls back to a deterministic SQL sort when no model is reachable.",
    auth: "bearer",
    request: RecommendRequestSchema,
    responses: [ok("The recommended task, or null", RecommendResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/ai/parse",
    tag: "AI",
    summary: "Parse natural language into a structured task",
    description:
      "Degrades gracefully: on any model failure it echoes the raw text with " +
      "`confidence: 0` rather than erroring, so quick-add always yields something editable.",
    auth: "bearer",
    request: ParseRequestSchema,
    responses: [ok("Parsed task fields", ParseResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/ai/breakdown",
    tag: "AI",
    summary: "Break a task into subtasks",
    auth: "bearer",
    request: BreakdownRequestSchema,
    responses: [ok("Suggested subtasks", BreakdownResponseSchema), notFound("Task not found")],
  },
  {
    method: "post",
    path: "/v1/ai/chat",
    tag: "AI",
    summary: "Chat with the assistant",
    description:
      "Tool-using conversation. Tools reach data through the REST API, never the database " +
      "directly, and high-risk operations are never exposed as tools.",
    auth: "bearer",
    request: ChatRequestSchema,
    responses: [
      ok("Assistant reply", ChatResponseSchema),
      { status: 502, description: "Upstream AI provider unavailable" },
    ],
  },
];

const calendarRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/calendar/feed",
    tag: "Calendar",
    summary: "Get the caller's private iCal feed URL",
    auth: "bearer",
    responses: [ok("Feed URL and token metadata", CalendarFeedResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/calendar/feed/rotate",
    tag: "Calendar",
    summary: "Rotate the iCal feed token",
    description: "Invalidates the previous URL — use after accidentally sharing it.",
    auth: "bearer",
    responses: [ok("The new feed URL", CalendarFeedResponseSchema)],
  },
  {
    method: "get",
    path: "/v1/calendar/feed.ics",
    tag: "Calendar",
    summary: "Subscribe to the iCal feed",
    description:
      "Authenticated by an unguessable per-user token in the query string, because calendar " +
      "clients (Google/Apple) cannot send an Authorization header. Rate-limited, and the " +
      "token is rotatable.",
    auth: "feed-token",
    responses: [
      { status: 200, description: "iCalendar document", contentType: "text/calendar" },
      { status: 401, description: "Missing or invalid feed token" },
      { status: 429, description: "Rate limited" },
    ],
  },
];

const syncRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/sync/status",
    tag: "Sync",
    summary: "Get sync state for the caller",
    auth: "bearer",
    responses: [ok("Sync status", SyncStatusResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/sync/enable",
    tag: "Sync",
    summary: "Enable cloud sync",
    auth: "bearer",
    responses: [ok("Sync enabled", SyncStatusResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/sync/disable",
    tag: "Sync",
    summary: "Disable cloud sync",
    auth: "bearer",
    responses: [ok("Sync disabled", SyncStatusResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/sync/now",
    tag: "Sync",
    summary: "Run one full sync cycle",
    auth: "bearer",
    responses: [ok("Cycle result", SyncCycleResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/sync/pull",
    tag: "Sync",
    summary: "Pull changes since a cursor",
    description: "Server-authoritative incremental delta (ADR-0003), ordered by hybrid logical clock.",
    auth: "bearer",
    request: SyncPullRequestSchema,
    responses: [ok("Changed rows plus the next cursor", SyncPullResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/sync/push",
    tag: "Sync",
    summary: "Push local changes",
    description: "Last-writer-wins on the HLC; the server rejects rows it does not own.",
    auth: "bearer",
    request: SyncPushRequestSchema,
    responses: [ok("Per-row accept/reject result", SyncPushResponseSchema)],
  },
];

const storageRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/storage/info",
    tag: "Storage",
    summary: "Where the database file lives and how large it is",
    auth: "bearer",
    responses: [ok("Database file info", StorageInfoWireSchema)],
  },
];

const feedbackRoutes: RouteDef[] = [
  {
    method: "get",
    path: "/v1/feedback",
    tag: "Feedback",
    summary: "List the caller's own submitted feedback",
    auth: "bearer",
    responses: [ok("Feedback items", FeedbackListResponseSchema)],
  },
  {
    method: "post",
    path: "/v1/feedback",
    tag: "Feedback",
    summary: "Submit feedback",
    auth: "bearer",
    request: CreateFeedbackBodySchema,
    responses: [
      created("Submitted", CreateFeedbackResponseSchema),
      { status: 429, description: "Per-user submission cap reached (anti-spam)" },
    ],
  },
  {
    method: "get",
    path: "/v1/admin/feedback",
    tag: "Feedback",
    summary: "List all feedback (admin)",
    auth: "admin",
    responses: [
      ok("All feedback with reporter identity", AdminFeedbackListResponseSchema),
      { status: 403, description: "Caller is not on the admin allow-list" },
    ],
  },
  {
    method: "patch",
    path: "/v1/admin/feedback/:id",
    tag: "Feedback",
    summary: "Triage a feedback item (admin)",
    auth: "admin",
    request: UpdateFeedbackObjectSchema,
    responses: [
      ok("The updated item", AdminFeedbackUpdateResponseSchema),
      { status: 403, description: "Caller is not on the admin allow-list" },
      notFound(),
    ],
  },
];

/**
 * Every endpoint the service exposes. Order here is the order tags appear in the
 * rendered documentation.
 */
export const API_ROUTES: readonly RouteDef[] = Object.freeze([
  ...infraRoutes,
  ...authRoutes,
  ...oauthRoutes,
  ...userRoutes,
  ...taskRoutes,
  ...peopleRoutes,
  ...projectRoutes,
  ...habitRoutes,
  ...countdownRoutes,
  ...templateRoutes,
  ...focusRoutes,
  ...settingsRoutes,
  ...aiRoutes,
  ...calendarRoutes,
  ...syncRoutes,
  ...storageRoutes,
  ...feedbackRoutes,
]);

/** `GET /v1/tasks/:id` — the canonical key used to diff registry against router. */
export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/** The set of `METHOD /path` keys the registry declares. */
export function registryRouteKeys(): Set<string> {
  return new Set(API_ROUTES.map((r) => routeKey(r.method, r.path)));
}
