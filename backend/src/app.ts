import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import tasksRoutes from "./routes/tasks.js";
import peopleRoutes from "./routes/people.js";
import completedRoutes from "./routes/completed.js";
import focusRoutes from "./routes/focus.js";
import settingsRoutes from "./routes/settings.js";
import aiRoutes from "./routes/ai.js";
import outlookRoutes from "./routes/outlook.js";
import storageRoutes from "./routes/storage.js";
import syncRoutes from "./routes/sync.js";
import docsRoutes from "./routes/docs.js";
import habitsRoutes from "./routes/habits.js";
import countdownsRoutes from "./routes/countdowns.js";
import { queryOne } from "./db/client.js";

const allowedOrigins = (process.env.LUMO_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const exactOrigins = allowedOrigins.filter((o) => !o.startsWith("."));
const suffixPatterns = allowedOrigins.filter((o) => o.startsWith("."));

export const app = new Hono();

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

const v1 = new Hono();
v1.route("/auth", authRoutes);
v1.route("/user", userRoutes);
v1.route("/tasks", tasksRoutes);
v1.route("/people", peopleRoutes);
v1.route("/completed", completedRoutes);
v1.route("/focus", focusRoutes);
v1.route("/settings", settingsRoutes);
v1.route("/ai", aiRoutes);
v1.route("/outlook", outlookRoutes);
v1.route("/storage", storageRoutes);
v1.route("/sync", syncRoutes);
v1.route("/habits", habitsRoutes);
v1.route("/countdowns", countdownsRoutes);

app.route("/v1", v1);
app.route("/docs", docsRoutes);

// Deep health check: verify DB connectivity so a load balancer drains an
// instance whose database is unreachable instead of routing traffic to it.
app.get("/health", async (c) => {
  try {
    await queryOne("SELECT 1 AS ok");
    return c.json({ ok: true, db: "up" });
  } catch (err) {
    console.error("[health] db check failed:", (err as Error)?.message ?? err);
    return c.json({ ok: false, db: "down" }, 503);
  }
});

app.onError((err, c) => {
  console.error("[unhandled]", err?.message ?? err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
});
