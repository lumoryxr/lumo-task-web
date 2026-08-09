/**
 * Auth fixtures for backend tests.
 *
 * The backend seeds NO accounts (no default/demo user in any environment), so
 * fixtures create their users through the public registration API exactly like
 * real users. Registration is username-first (#17): the register endpoint takes
 * only { username, password }. `newUserWithToken()` additionally BINDS a unique
 * email to the fresh account so email-based recovery flows in tests have a
 * target; `signInDemo()` lazily registers a single "primary" fixture user (with
 * per-run RANDOM credentials — never hardcoded) and returns a token for it.
 */
import { randomBytes } from "node:crypto";
import { req } from "./client.js";

// Per-run random credentials — no hardcoded secrets anywhere in the codebase.
export const DEMO_USERNAME = `primary${randomBytes(5).toString("hex")}`;
export const DEMO_PASSWORD = `pw${randomBytes(12).toString("hex")}`;
export const DEMO_EMAIL = `primary-${randomBytes(6).toString("hex")}@test.local`;

export interface AuthedUser {
  token: string;
  userId: string;
  username: string;
  email: string;
}

/** Monotonic suffix so repeated registrations within a file never collide. */
let seq = 0;

/** A unique, contract-valid username (letters+digits only, 3–32 chars). */
export function uniqueUsername(prefix = "user"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
}

export function uniqueEmail(prefix = "user"): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}@example.com`;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Register the primary fixture user via the public API (idempotent per process). */
let demoRegistered = false;
export async function ensureDemoUser(): Promise<void> {
  if (demoRegistered) return;
  const { status, body } = await req("POST", "/v1/auth/register", {
    body: { username: DEMO_USERNAME, password: DEMO_PASSWORD },
  });
  if (status !== 201 && status !== 409) throw new Error(`demo register failed (${status})`);
  // Bind the demo email so email-targeted flows can reach this account.
  if (status === 201) {
    await req("POST", "/v1/auth/bind-email", {
      token: body.token,
      body: { email: DEMO_EMAIL },
    });
  }
  demoRegistered = true;
}

/** Register-if-needed and sign in as the primary fixture user. */
export async function signInDemo(): Promise<AuthedUser> {
  await ensureDemoUser();
  const { status, body } = await req("POST", "/v1/auth/signin", {
    body: { username: DEMO_USERNAME, password: DEMO_PASSWORD },
  });
  if (status !== 200) throw new Error(`demo sign-in failed (${status})`);
  return { token: body.token, userId: body.user.id, username: DEMO_USERNAME, email: DEMO_EMAIL };
}

/** Register a brand-new user (+ bound email) and return the issued token. */
export async function newUserWithToken(prefix = "user"): Promise<AuthedUser> {
  const username = uniqueUsername(prefix);
  const email = uniqueEmail(prefix);
  const { status, body } = await req("POST", "/v1/auth/register", {
    body: { username, password: "password123" },
  });
  if (status !== 201) throw new Error(`register failed (${status})`);
  // Bind a unique email so tests exercising the email recovery/verification
  // flows have an address to target. Best-effort — never blocks the fixture.
  await req("POST", "/v1/auth/bind-email", { token: body.token, body: { email } });
  return { token: body.token, userId: body.user.id, username, email };
}
