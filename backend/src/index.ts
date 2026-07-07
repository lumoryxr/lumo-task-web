import { serve } from "@hono/node-server";
import { runMigrations } from "./db/migrate.js";
import { app } from "./app.js";
import { validateStartupSecrets } from "./lib/secret-policy.js";
import { mountWebStatic } from "./lib/webStatic.js";

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

// Mount SPA hosting before serving (after routes are registered in app.ts, so
// the static `/*` middleware never shadows the API). Fails fast if the packaged
// web root is missing its index.html.
if (webRoot) {
  try {
    mountWebStatic(app, webRoot);
    console.log(`Serving web app from ${webRoot}`);
  } catch (err) {
    console.error(`Refusing to start: web root "${webRoot}" is unusable: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Run migrations before accepting requests (the backend seeds no accounts).
runMigrations()
  .then(() => {
    console.log(`Lumo backend starting on ${hostname ?? "0.0.0.0"}:${port}`);
    serve({ fetch: app.fetch, port, hostname });
    // NOTE: the desktop sync cadence is driven by the RENDERER (`useSyncEngine`),
    // not a backend timer. A backend loop advanced the pull cursor without the
    // renderer knowing, so pulled cloud rows sat in SQLite and never appeared in
    // the UI until an app restart. Driving from the renderer keeps "pull rows"
    // and "refresh the UI" together. The backend only SERVES the sync endpoints
    // (/v1/sync/pull|push + /enable|/now|/status).
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
