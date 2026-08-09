/**
 * Boot-time validation of the database environment (the Turso/libsql vars read
 * by `db/client.ts`). Its whole job is to turn the two most common cloud-deploy
 * footguns into a LOUD, actionable failure at startup instead of a cryptic
 * connection error thrown mid-migration — which on Render surfaces only as a
 * generic "deploy failed" / health-check timeout with no usable cause.
 *
 * Pure + env-injected so it is unit-testable without touching `process.env`.
 */

export type DbMode = "local" | "replica" | "cloud";

export interface DbEnv {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  TURSO_SYNC_URL?: string;
  TURSO_SYNC_TOKEN?: string;
  LUMO_DB_PATH?: string;
}

// Schemes libsql's createClient accepts for a REMOTE database — these are the
// ones that require an auth token to reach a hosted Turso DB.
const REMOTE_SCHEMES = ["libsql://", "https://", "http://", "wss://", "ws://"];
// `file:` is also a valid createClient URL (a local SQLite file, used e.g. by
// the test env's `file::memory:`); it needs no token. Anything with neither a
// remote scheme nor `file:` is a value libsql can't parse → it would throw.
const LOCAL_FILE_SCHEME = "file:";

/**
 * Classify the configured mode and return the first config error (or null).
 * Mirrors the selection order in `db/client.ts`: replica (sync) → cloud
 * (direct url) → local (file).
 */
export function checkDbConfig(env: DbEnv): { mode: DbMode; error: string | null } {
  const directUrl = env.TURSO_DATABASE_URL?.trim();
  const authToken = env.TURSO_AUTH_TOKEN?.trim();
  const syncUrl = env.TURSO_SYNC_URL?.trim();

  const mode: DbMode = syncUrl ? "replica" : directUrl ? "cloud" : "local";

  // A token set with no URL (and no sync URL) is a misconfig: client.ts would
  // silently fall back to an EPHEMERAL local file, ignoring the token — exactly
  // the "my data vanished on redeploy" trap. Fail loudly instead.
  if (!directUrl && !syncUrl && authToken) {
    return {
      mode,
      error:
        "TURSO_AUTH_TOKEN is set but TURSO_DATABASE_URL is not — the backend would " +
        "silently use an ephemeral local file and ignore the token. Set TURSO_DATABASE_URL " +
        "(libsql://…) for cloud persistence, or unset TURSO_AUTH_TOKEN for local-only.",
    };
  }

  if (mode === "cloud") {
    const url = directUrl!.toLowerCase();
    const isRemote = REMOTE_SCHEMES.some((s) => url.startsWith(s));
    const isLocalFile = url.startsWith(LOCAL_FILE_SCHEME);
    if (!isRemote && !isLocalFile) {
      return {
        mode,
        error:
          `TURSO_DATABASE_URL ("${directUrl}") has an unsupported scheme — libsql can't parse ` +
          `it. Use "libsql://…" (or "https://…") for a hosted Turso DB, or a "file:" URL for a ` +
          `local file.`,
      };
    }
    // A remote (hosted) DB rejects unauthenticated access, so a URL without a
    // token would 401 on the first query and crash migrations at boot. A local
    // "file:" URL needs no token, so only enforce this for remote schemes.
    if (isRemote && !authToken) {
      return {
        mode,
        error:
          "TURSO_DATABASE_URL is set to a remote database but TURSO_AUTH_TOKEN is missing/blank " +
          "— a hosted Turso database rejects unauthenticated access, so migrations fail at boot. " +
          "Set TURSO_AUTH_TOKEN (turso db tokens create <db>).",
      };
    }
  }

  return { mode, error: null };
}

/** Boot-time assertion. Throws with a clear, secret-free message on misconfig. */
export function assertStartupDbConfig(env: DbEnv = process.env): void {
  const { error } = checkDbConfig(env);
  if (error) throw new Error(error);
}
