/**
 * Auth fixtures for backend tests.
 *
 * The backend seeds NO accounts (no default/demo user in any environment), so
 * fixtures create their users through the public registration API exactly like
 * real users. `signInDemo()` lazily registers a single "primary" fixture user
 * (with per-run RANDOM credentials — never hardcoded) and returns a token for
 * it; `newUserWithToken()` registers a fresh isolated user each call.
 */
import { randomBytes } from "node:crypto";
import { req } from "./client.js";

// Per-run random credentials — no hardcoded secrets anywhere in the codebase.
export const DEMO_EMAIL = `primary-${randomBytes(6).toString("hex")}@test.local`;
export const DEMO_PASSWORD = `pw-${randomBytes(12).toString("hex")}`;

export interface AuthedUser {
  token: string;
  userId: string;
  email: string;
}

/** Monotonic suffix so repeated registrations within a file never collide. */
let seq = 0;
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
  const { status } = await req("POST", "/v1/auth/register", {
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Primary Test User" },
  });
  if (status !== 201 && status !== 409) throw new Error(`demo register failed (${status})`);
  demoRegistered = true;
}

/** Register-if-needed and sign in as the primary fixture user. */
export async function signInDemo(): Promise<AuthedUser> {
  await ensureDemoUser();
  const { status, body } = await req("POST", "/v1/auth/signin", {
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  if (status !== 200) throw new Error(`demo sign-in failed (${status})`);
  return { token: body.token, userId: body.user.id, email: DEMO_EMAIL };
}

/** Register a brand-new user and return the issued token. */
export async function newUserWithToken(prefix = "user"): Promise<AuthedUser> {
  const email = uniqueEmail(prefix);
  const { status, body } = await req("POST", "/v1/auth/register", {
    body: { email, password: "password123", name: prefix },
  });
  if (status !== 201) throw new Error(`register failed (${status})`);
  return { token: body.token, userId: body.user.id, email };
}
