import { serve } from "@hono/node-server";
import { runMigrations } from "./db/migrate.js";
import { app } from "./app.js";
import { validateStartupSecrets } from "./lib/secret-policy.js";
import { assertStartupDbConfig } from "./db/dbConfig.js";
import { assertStartupEmailConfig } from "./lib/email-policy.js";
import { dbMode } from "./db/client.js";
import { mountWebStatic } from "./lib/webStatic.js";
import { log } from "./lib/logger.js";
import { installCrashHandlers } from "./lib/crashHandler.js";

// Catch process-level crashes FIRST, before anything else can throw: an
// unhandled rejection or an uncaught exception would otherwise print a raw
// stack trace to stderr and exit, bypassing the structured logger entirely —
// no JSON line, no redaction, nothing in the LUMO_LOG_FILE sink an operator is
// tailing. The handler records the crash and still exits non-zero, so the
// platform restarts the instance exactly as before.
installCrashHandlers();

// Render/Heroku/most PaaS inject the bind port via PORT; LUMO_PORT is the local override.
const port = parseInt(process.env.PORT ?? process.env.LUMO_PORT ?? "47291");

// Local/LAN web package: also serve the built SPA on this port (single process,
// same origin). Unset on cloud (Render) and in tests → pure API, no change.
const webRoot = process.env.LUMO_WEB_ROOT?.trim();

// Bind host. Unset → bind all interfaces (default), which is what the LAN
// package wants. Set LUMO_HOST=127.0.0.1 to restrict to this machine only.
const hostname = process.env.LUMO_HOST?.trim() || undefined;

// Fail-safe: security controls must never be disabled in production.
if (process.env.NODE_ENV === "production" && process.env.LUMO_DISABLE_RATE_LIMIT === "1") {
  console.error("Refusing to start: LUMO_DISABLE_RATE_LIMIT must not be set in production.");
  process.exit(1);
}

// Fail FAST and loud on a weak/blank/placeholder secret, at boot — so a
// misconfig fails the deploy/healthcheck instead of 500ing live traffic later.
try {
  validateStartupSecrets();
} catch (err) {
  console.error(`Refusing to start: ${(err as Error).message}`);
  process.exit(1);
}

// Fail FAST on a misconfigured database (the #1 cloud-deploy footgun): a partial
// or malformed Turso config would otherwise throw a cryptic error mid-migration,
// which on Render looks only like a generic "deploy failed" / health-check
// timeout. Catch it here with an actionable, secret-free message.
try {
  assertStartupDbConfig();
} catch (err) {
  console.error(`Refusing to start: ${(err as Error).message}`);
  process.exit(1);
}

// Fail FAST on a half-configured email provider (opt-in only): if a provider is
// set, its credentials must be complete, or password-reset/verification emails
// would be silently dropped. No provider set → no-op, unchanged.
try {
  assertStartupEmailConfig();
} catch (err) {
  console.error(`Refusing to start: ${(err as Error).message}`);
  process.exit(1);
}

// Mount SPA hosting before serving (after routes are registered in app.ts, so
// the static `/*` middleware never shadows the API). Fails fast if the packaged
// web root is missing its index.html.
if (webRoot) {
  try {
    mountWebStatic(app, webRoot);
    log("info", { msg: "serving web app", webRoot });
  } catch (err) {
    console.error(`Refusing to start: web root "${webRoot}" is unusable: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Run migrations before accepting requests (the backend seeds no accounts).
// Log the resolved DB mode up front so a deploy log immediately shows whether
// the instance is talking to cloud Turso, a local file, or an embedded replica.
log("info", { msg: "database configured", mode: dbMode() });
runMigrations()
  .then(() => {
    log("info", { msg: "backend started", host: hostname ?? "0.0.0.0", port });
    const server = serve({ fetch: app.fetch, port, hostname });

    // Graceful shutdown: on a platform stop signal (e.g. Render redeploy), stop
    // accepting new connections and let in-flight requests drain before exit,
    // instead of dropping them mid-flight. A short hard-deadline guarantees the
    // process still exits if a connection hangs.
    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      log("info", { msg: "shutting down", signal });
      const deadline = setTimeout(() => process.exit(0), 10_000);
      deadline.unref();
      server.close(() => process.exit(0));
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    // NOTE: the desktop sync cadence is driven by the RENDERER (`useSyncEngine`),
    // not a backend timer. A backend loop advanced the pull cursor without the
    // renderer knowing, so pulled cloud rows sat in SQLite and never appeared in
    // the UI until an app restart. Driving from the renderer keeps "pull rows"
    // and "refresh the UI" together. The backend only SERVES the sync endpoints
    // (/v1/sync/pull|push + /enable|/now|/status).
  })
  .catch((err) => {
    // Migrations run the first real DB round-trip, so a connection/auth problem
    // (e.g. wrong TURSO_AUTH_TOKEN, unreachable Turso) lands here. Name the mode
    // so the deploy log points at the right knob instead of a bare stack trace.
    console.error(
      `Startup failed while running migrations (db mode: ${dbMode()}). ` +
        `If mode is "cloud", check TURSO_DATABASE_URL/TURSO_AUTH_TOKEN reachability. Error:`,
      err,
    );
    process.exit(1);
  });
