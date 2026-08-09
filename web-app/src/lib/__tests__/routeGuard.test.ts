import { describe, it, expect } from "vitest";
import { guardRedirect, isPublicPath, PUBLIC_PATHS } from "../routeGuard";

const SIGNED_OUT = { onboarded: true, isSignedIn: false };
const SIGNED_IN = { onboarded: true, isSignedIn: true };

describe("guardRedirect — first-run (onboarding) gate", () => {
  it("sends an un-onboarded visitor to /onboarding", () => {
    expect(guardRedirect("/today", { onboarded: false, isSignedIn: false })).toBe("/onboarding");
    expect(guardRedirect("/login", { onboarded: false, isSignedIn: false })).toBe("/onboarding");
  });

  it("does not loop when already on /onboarding", () => {
    expect(guardRedirect("/onboarding", { onboarded: false, isSignedIn: false })).toBeNull();
  });
});

describe("guardRedirect — mandatory-login gate", () => {
  it("redirects a signed-out user away from a protected route", () => {
    expect(guardRedirect("/today", SIGNED_OUT)).toBe("/login");
    expect(guardRedirect("/account", SIGNED_OUT)).toBe("/login");
    expect(guardRedirect("/settings", SIGNED_OUT)).toBe("/login");
  });

  it("allows a signed-out user to reach every public path (no loop on /login)", () => {
    for (const p of PUBLIC_PATHS) {
      expect(guardRedirect(p, SIGNED_OUT)).toBeNull();
    }
  });

  it("REGRESSION: password-recovery + verify + legal are reachable while signed out", () => {
    // The whole point of recovery is that the user cannot sign in — these must
    // never bounce to /login.
    expect(guardRedirect("/forgot-password", SIGNED_OUT)).toBeNull();
    expect(guardRedirect("/reset-password", SIGNED_OUT)).toBeNull();
    expect(guardRedirect("/verify-email", SIGNED_OUT)).toBeNull();
    expect(guardRedirect("/legal/terms", SIGNED_OUT)).toBeNull();
    expect(guardRedirect("/legal/privacy", SIGNED_OUT)).toBeNull();
  });

  it("lets a signed-in user through to protected routes", () => {
    expect(guardRedirect("/today", SIGNED_IN)).toBeNull();
    expect(guardRedirect("/account", SIGNED_IN)).toBeNull();
  });
});

describe("isPublicPath", () => {
  it("recognises public vs protected paths", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/forgot-password")).toBe(true);
    expect(isPublicPath("/today")).toBe(false);
    expect(isPublicPath("/account")).toBe(false);
  });
});
