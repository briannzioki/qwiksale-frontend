import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = process.env.PORT || "3000";
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// Storage files (globalSetup will create these if creds work)
const AUTH_DIR = path.resolve("tests/e2e/.auth");
const STORAGE_DEFAULT = path.join(AUTH_DIR, "state.json");   // fallback
const STORAGE_ADMIN   = path.join(AUTH_DIR, "admin.json");   // used by admin tests
const STORAGE_USER    = path.join(AUTH_DIR, "user.json");    // used by user tests

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    // default storage for any e2e test that doesn't override via `test.extend({ storageState })`
    storageState: STORAGE_DEFAULT,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // ⬇️ This will generate admin.json, user.json and a default state.json
  globalSetup: "./tests/e2e/global-setup.ts",
});
