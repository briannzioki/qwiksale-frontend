// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = String(process.env.PORT || 3000);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// If using a running server (externally) or explicitly requested dev
const USING_EXTERNAL_SERVER = !!process.env.E2E_BASE_URL || process.env.USE_DEV === "1";
// Use production start (built app) in CI or when E2E_PROD=1
const USE_START = process.env.E2E_PROD === "1" || process.env.CI === "1";

const AUTH_DIR = path.resolve("tests/e2e/.auth");
const STORAGE_DEFAULT = path.join(AUTH_DIR, "state.json");
const STORAGE_ADMIN = path.join(AUTH_DIR, "admin.json");
const STORAGE_USER = path.join(AUTH_DIR, "user.json");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_DEFAULT,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
    // ✅ belongs under `use`, not top-level
    testIdAttribute: "data-testid",
  },
  webServer: USING_EXTERNAL_SERVER
    ? undefined
    : {
        // Pass -p directly (no extra “--” needed with pnpm)
        command: USE_START ? `pnpm start:e2e -p ${PORT}` : `pnpm dev -p ${PORT}`,
        url: BASE_URL,
        timeout: 240_000,
        reuseExistingServer: true,
        env: {
          // Keep runs deterministic and domain-agnostic
          NODE_ENV: USE_START ? "production" : "development",
          NEXT_PUBLIC_E2E: "1",
          NEXT_IMAGE_UNOPTIMIZED: "1",
          PRIMARY_DOMAIN_ENFORCE: "0",
          PORT: PORT,
        },
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./tests/e2e/global-setup.ts",
});

export { STORAGE_DEFAULT, STORAGE_ADMIN, STORAGE_USER };
