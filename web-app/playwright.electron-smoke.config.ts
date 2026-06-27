/**
 * Playwright config for the per-PR Electron desktop SMOKE suite.
 *
 * Runs the reliable, environment-robust desktop checks (matched by
 * `electron-smoke*.spec.ts`):
 *   • electron-smoke.spec.ts             — launch + backend health + render + CRUD
 *   • electron-smoke.persistence.spec.ts — data survives an app restart
 * Wired into electron-smoke.yml on every commit, and the Windows release gate.
 * The full electron.spec.ts walkthrough (heavier, auth-injection UI) uses
 * playwright.electron.config.ts instead.
 *
 * Requires a production build (web-app dist + backend dist); the workflow builds
 * both before invoking this config.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /electron-smoke.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Two-launch persistence tests need headroom (launch ≤60s + API + shutdown).
  timeout: 120_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-electron-smoke", open: "never" }],
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
