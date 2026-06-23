import { defineConfig, devices } from "@playwright/test";

const BASE_URL =
  process.env.PROD_BASE_URL ?? "https://lumo-task-frontend.onrender.com";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
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
