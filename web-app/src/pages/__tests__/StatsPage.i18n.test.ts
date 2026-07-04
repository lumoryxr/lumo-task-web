/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { STRINGS } from "@/i18n/strings";
import statsSource from "../StatsPage.tsx?raw";

/**
 * Regression guard for the Stats auth-required i18n fix (Phase 1 polish).
 *
 * The signed-out "Sign in required" empty state on Stats used to hardcode its
 * English subtitle (`Sign in to view your productivity stats.`), bypassing the
 * i18n dictionary — the only page auth-required state to do so while its
 * siblings (Countdown/Habits) route the subtitle through `auth.required.*`.
 * It now uses `t("auth.required.stats")`. This guard keeps the literal from
 * creeping back into *this* file and pins the key's en/zh parity.
 */
describe("StatsPage i18n", () => {
  it("does not hardcode the auth-required subtitle in English", () => {
    expect(statsSource).not.toContain("Sign in to view your productivity stats");
  });

  it("routes the auth-required subtitle through the i18n dictionary", () => {
    expect(statsSource).toContain('t("auth.required.stats")');
  });

  it("defines auth.required.stats in both locales (en + zh parity)", () => {
    expect(STRINGS.en["auth.required.stats"], "missing en").toBeTruthy();
    expect(STRINGS.zh["auth.required.stats"], "missing zh").toBeTruthy();
  });
});
