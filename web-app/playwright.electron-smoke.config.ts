/**
 * Playwright config for the per-PR Electron desktop SMOKE suite.
 *
 * Runs only electron-smoke.spec.ts (launch + backend health + render) — the
 * minimal, reliable check wired into electron-smoke.yml on every commit. The
 * full electron.spec.ts walkthrough uses playwright.electron.config.ts instead.
 *
 * Requires a production build (web-app dist + backend dist); the workflow builds
 * both before invoking this config.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "electron-smoke.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
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
