// playwright.config.ts (ESM-safe but doesn't use import.meta)
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const storageState = path.resolve("tests/e2e/.auth/state.json");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  expect: { timeout: 12_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    storageState,
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://127.0.0.1:3000",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./tests/e2e/global-setup.ts",
});
