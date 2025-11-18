// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = String(process.env.PORT || 3000);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// If you're already running `pnpm dev`, either set USE_DEV=1 or leave it as-is;
// with reuseExistingServer=true we’ll detect and reuse the running server.
// If E2E_BASE_URL is set, we never try to start a server at all.
const USING_EXTERNAL_SERVER = !!process.env.E2E_BASE_URL || process.env.USE_DEV === "1";

// Storage files (globalSetup will create these if creds work)
const AUTH_DIR = path.resolve("tests/e2e/.auth");
const STORAGE_DEFAULT = path.join(AUTH_DIR, "state.json"); // fallback
const STORAGE_ADMIN = path.join(AUTH_DIR, "admin.json");   // used by admin tests
const STORAGE_USER = path.join(AUTH_DIR, "user.json");     // used by user tests

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
  webServer: USING_EXTERNAL_SERVER
    ? undefined
    : {
        // Use dev server by default so HMR/build isn’t required.
        // Extra args make sure we bind to the same PORT the tests expect.
        command: `pnpm dev -- -p ${PORT}`,
        url: BASE_URL,
        timeout: 180_000,
        // If something is already listening at BASE_URL, don't try to spawn another.
        reuseExistingServer: true,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // This will generate admin.json, user.json and a default state.json
  globalSetup: "./tests/e2e/global-setup.ts",
});

// Export paths for tests/imports if you want (optional)
export { STORAGE_DEFAULT, STORAGE_ADMIN, STORAGE_USER };
