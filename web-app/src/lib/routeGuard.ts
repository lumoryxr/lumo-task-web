/**
 * Route-access policy for the app root.
 *
 * Login is mandatory (there is no "continue without an account" path). Two
 * gates apply, in order:
 *   1. First-run: an un-onboarded visitor is sent to /onboarding.
 *   2. Auth: an onboarded but signed-out visitor may reach only the PUBLIC
 *      paths (sign-in, registration, password recovery, email verification,
 *      and the legal pages); every other route redirects to /login.
 *
 * Kept as a pure function so the policy is unit-tested directly, rather than by
 * mounting the whole App tree. `App` renders `<Navigate>` from its result.
 */

/**
 * Paths reachable while signed out (once onboarded). Everything else requires
 * authentication. Recovery + verification + legal MUST be here: the people who
 * need password recovery are by definition signed out.
 */
export const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/oauth/github",
  "/legal/privacy",
  "/legal/terms",
] as const;

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

/**
 * The path to redirect to for the given location + auth state, or `null` to
 * allow the current route. Never returns the current path (no redirect loop).
 */
export function guardRedirect(
  pathname: string,
  state: { onboarded: boolean; isSignedIn: boolean },
): string | null {
  if (!state.onboarded) {
    return pathname === "/onboarding" ? null : "/onboarding";
  }
  if (!state.isSignedIn && !isPublicPath(pathname)) {
    return "/login";
  }
  return null;
}
