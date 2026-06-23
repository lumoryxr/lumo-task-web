import { serve } from "@hono/node-server";
import { runMigrations, ensureDefaultUser } from "./db/migrate.js";
import { app } from "./app.js";
import { initSync } from "./lib/sync.js";

// Render/Heroku/most PaaS inject the bind port via PORT; LUMO_PORT is the local override.
const port = parseInt(process.env.PORT ?? process.env.LUMO_PORT ?? "47291");

// Run migrations before accepting requests
runMigrations()
  .then(() => ensureDefaultUser())
  .then(() => {
    initSync().catch((e) => console.error("[sync] startup error:", e.message));
    console.log(`Lumo backend starting on port ${port}`);
    serve({ fetch: app.fetch, port });
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
