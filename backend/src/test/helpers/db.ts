/**
 * Per-file database setup for backend tests.
 *
 * Node's test runner isolates each test file in its own child process, so each
 * file gets a fresh in-memory SQLite (via `--env-file .env.test`). `setupDb()`
 * runs the (idempotent) migrations — it seeds NO users (the backend never seeds
 * accounts). Tests create the users they need via the public API; call
 * `ensureDemoUser()`/`signInDemo()` for the shared primary fixture user.
 */
import { runMigrations } from "../../db/migrate.js";

export async function setupDb(): Promise<void> {
  await runMigrations();
}
