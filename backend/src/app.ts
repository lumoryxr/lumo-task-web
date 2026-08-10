import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth.js";
import oauthGithubRoutes from "./routes/oauthGithub.js";
import userRoutes from "./routes/user.js";
import tasksRoutes from "./routes/tasks.js";
import peopleRoutes from "./routes/people.js";
import completedRoutes from "./routes/completed.js";
import focusRoutes from "./routes/focus.js";
import settingsRoutes from "./routes/settings.js";
import aiRoutes from "./routes/ai.js";
import calendarRoutes from "./routes/calendar.js";
import storageRoutes from "./routes/storage.js";
import syncRoutes from "./routes/sync.js";
import docsRoutes from "./routes/docs.js";
import habitsRoutes from "./routes/habits.js";
import countdownsRoutes from "./routes/countdowns.js";
import templatesRoutes from "./routes/templates.js";
import projectsRoutes from "./routes/projects.js";
import { feedbackRoutes, adminFeedbackRoutes } from "./routes/feedback.js";
import { queryOne } from "./db/client.js";
import { log, resolveRequestId } from "./lib/logger.js";
import { bodySizeLimit } from "./lib/bodyLimit.js";
import { metricsMiddleware, registerMetricsRoute } from "./lib/metrics.js";

const allowedOrigins = (process.env.LUMO_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const exactOrigins = allowedOrigins.filter((o) => !o.startsWith("."));
const suffixPatterns = allowedOrigins.filter((o) => o.startsWith("."));

type AppVariables = { requestId: string };
export const app = new Hono<{ Variables: AppVariables }>();

// Request correlation + structured access log. Assigns each request a trace id
// (honoring a safe inbound x-request-id), echoes it on the response, and emits
// one JSON line per request so a prod 500 can be traced back to its request.
const QUIET_LOG = process.env.NODE_ENV === "test";
app.use("/*", async (c, next) => {
  const requestId = resolveRequestId(c.req.header("x-request-id"));
  c.set("requestId", requestId);
  const start = Date.now();
  await next();
  c.header("x-request-id", requestId);
  if (!QUIET_LOG) {
    log("info", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  }
});

// Record request volume, latency, and concurrency for Prometheus. Placed right
// after the access log so it times the full downstream chain (routes + all
// later middleware). Self-skips the /metrics scrape endpoint.
app.use("/*", metricsMiddleware);

// Baseline security headers on every response (defense-in-depth for the API).
app.use("/*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
});

app.use(
  "/*",
  cors({
    origin: (origin) => {
      // No Origin header → server-to-server / Electron IPC (safe, no ACAO header added)
      // "null" Origin → Electron file:// renderer; return "null" not wildcard "*"
      if (!origin || origin === "null") return origin || null;
      if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) return origin;
      if (exactOrigins.includes(origin)) return origin;
      if (suffixPatterns.some((p) => origin.endsWith(p))) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

// Reject oversized request bodies at the edge (before JSON parse / Zod). Coarse
// byte-level backstop complementing the per-array count caps on bulk imports.
app.use("/*", bodySizeLimit);

const v1 = new Hono();
v1.route("/auth/github", oauthGithubRoutes);
v1.route("/auth", authRoutes);
v1.route("/user", userRoutes);
v1.route("/tasks", tasksRoutes);
v1.route("/people", peopleRoutes);
v1.route("/completed", completedRoutes);
v1.route("/focus", focusRoutes);
v1.route("/settings", settingsRoutes);
v1.route("/ai", aiRoutes);
v1.route("/calendar", calendarRoutes);
v1.route("/storage", storageRoutes);
v1.route("/sync", syncRoutes);
v1.route("/habits", habitsRoutes);
v1.route("/countdowns", countdownsRoutes);
v1.route("/templates", templatesRoutes);
v1.route("/projects", projectsRoutes);
v1.route("/feedback", feedbackRoutes);
v1.route("/admin/feedback", adminFeedbackRoutes);

app.route("/v1", v1);
app.route("/docs", docsRoutes);

// Liveness: is the process up? Kept shallow (no DB call) because this is what
// Render's healthCheckPath polls — coupling it to the DB would let a transient
// Turso blip restart-loop an otherwise-healthy instance.
app.get("/health", (c) => c.json({ ok: true }));

// Prometheus scrape endpoint (GET /metrics). Off unless LUMO_METRICS_TOKEN is
// set; when set, requires a matching Bearer token. See docs/OPERATIONS.md.
registerMetricsRoute(app);

// Readiness: can the process actually serve (DB reachable)? For load-balancer
// draining / external monitoring — returns 503 when the DB is unreachable.
app.get("/ready", async (c) => {
  try {
    await queryOne("SELECT 1 AS ok");
    return c.json({ ok: true, db: "up" });
  } catch (err) {
    log("error", { msg: "ready: db check failed", requestId: c.get("requestId"), error: (err as Error)?.message ?? String(err) });
    return c.json({ ok: false, db: "down" }, 503);
  }
});

app.onError((err, c) => {
  // Hono raises HTTPException for client-side faults detected before/within a
  // route handler — most importantly a malformed JSON body, which the validator
  // throws as HTTPException(400). Honor its (client-error) status so a bad
  // request can never masquerade as a 5xx outage, normalized into our standard
  // { error: { code, message } } envelope. Our own routes never throw
  // HTTPException (they return via httpError), so this only catches framework
  // parse errors. A 5xx HTTPException is a real server fault — fall through to
  // the logged generic 500 below rather than relaying its internal message.
  if (err instanceof HTTPException && err.status < 500) {
    const isBadJson = err.status === 400 && /malformed json/i.test(err.message);
    const code = isBadJson ? "INVALID_JSON" : err.status === 400 ? "BAD_REQUEST" : "HTTP_ERROR";
    const message = isBadJson ? "Malformed JSON body" : err.message;
    return c.json({ error: { code, message } }, err.status);
  }
  // Real server fault — log it with the request id (and stack, server-side only)
  // and hand the id back to the caller so a user-reported error is traceable to
  // this exact request in the logs, without leaking the internal message.
  const requestId = c.get("requestId");
  log("error", {
    requestId,
    msg: err?.message ?? String(err),
    stack: err?.stack,
    method: c.req.method,
    path: c.req.path,
  });
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error", requestId } },
    500
  );
});
