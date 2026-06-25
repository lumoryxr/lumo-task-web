import { serve } from "@hono/node-server";
import { runMigrations } from "./db/migrate.js";
import { app } from "./app.js";
import { initSync } from "./lib/sync.js";
import { startGcScheduler } from "./lib/gc.js";
import { validateStartupSecrets } from "./lib/secret-policy.js";

// Render/Heroku/most PaaS inject the bind port via PORT; LUMO_PORT is the local override.
const port = parseInt(process.env.PORT ?? process.env.LUMO_PORT ?? "47291");

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

// Run migrations before accepting requests (the backend seeds no accounts).
runMigrations()
  .then(() => {
    initSync().catch((e) => console.error("[sync] startup error:", e.message));
    // Prune old tombstones + idempotency keys now and daily (ADR-0003 Phase 5).
    // Best-effort, non-blocking — never delays accepting requests.
    startGcScheduler();
    console.log(`Lumo backend starting on port ${port}`);
    serve({ fetch: app.fetch, port });
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
