import { defineConfig, devices } from "@playwright/test";
import { TARGET_BASE_URL } from "./e2e/environments";

const BASE_URL = TARGET_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Auth route is rate-limited (10/IP/min); spec throttles register calls to
  // ≈7s apart, so later tests in the queue can wait 60–120s before their own
  // work even starts.
  timeout: 180_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-prod", open: "never" }],
    ["json", { outputFile: "playwright-report-prod/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
      grep: /@mobile/,
    },
  ],
});
