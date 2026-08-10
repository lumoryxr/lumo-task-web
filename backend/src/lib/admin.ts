import type { Context, Next } from "hono";
import type { Variables } from "../env.js";
import { queryOne } from "../db/client.js";
import { httpError } from "./errors.js";

/**
 * Admin authorization by email allow-list.
 *
 * There is no `role` column: the single-tenant / per-customer deployment model
 * (ADR-0004) means "who is the operator" is a deployment fact, not per-account
 * data. So an operator is any account whose bound email is listed in the
 * `LUMO_ADMIN_EMAILS` env var (comma-separated, case-insensitive). This keeps
 * admin power out of the database (a DB leak grants nobody admin) and lets a
 * self-hosted operator flip it with one env change and a restart-free re-read.
 */

/** Parse `LUMO_ADMIN_EMAILS` into a lowercased set. Read per call so the list
 *  can change without a code change (and tests can vary it per case). */
export function adminEmailAllowlist(): Set<string> {
  return new Set(
    (process.env.LUMO_ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * True iff the user's bound email is in the allow-list. Username-only accounts
 * (email NULL) are never admins; an empty allow-list means the deployment has no
 * admins at all (feedback is still collected, just not reviewable in-app yet).
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const allow = adminEmailAllowlist();
  if (allow.size === 0) return false;
  const u = await queryOne<{ email: string | null }>(
    "SELECT email FROM users WHERE id = :id",
    { id: userId },
  );
  return !!u?.email && allow.has(u.email.toLowerCase());
}

/**
 * Middleware: 403 unless the authenticated caller is an admin. Must run AFTER
 * `authMiddleware` (which sets `userId`). A non-admin gets FORBIDDEN, not 404,
 * because the route exists — the caller simply lacks permission.
 */
export async function requireAdmin(c: Context<{ Variables: Variables }>, next: Next) {
  const userId = c.get("userId");
  if (!userId || !(await isAdminUser(userId))) {
    return httpError(c, 403, "FORBIDDEN", "Admin access required");
  }
  await next();
}
