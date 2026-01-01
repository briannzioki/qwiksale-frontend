// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const CI = !!process.env.CI;
const PORT = String(process.env.PORT || 3000);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const DETERMINISTIC = process.env.E2E_DETERMINISTIC === "1";

// External server only when a base URL is provided
const USING_EXTERNAL_SERVER = !!process.env.E2E_BASE_URL;

// Explicitly force dev mode (but still let Playwright start it via webServer)
const FORCE_DEV = process.env.USE_DEV === "1";

// Use production start (built app) in CI or when E2E_PROD=1 (unless dev forced)
const USE_START = !FORCE_DEV && (process.env.E2E_PROD === "1" || CI);

const AUTH_DIR = path.resolve("tests/e2e/.auth");
const STORAGE_DEFAULT = path.join(AUTH_DIR, "state.json");
const STORAGE_ADMIN = path.join(AUTH_DIR, "admin.json");
const STORAGE_USER = path.join(AUTH_DIR, "user.json");

export default defineConfig({
  testDir: "tests/e2e",

  // Per-test timeout
  timeout: 60_000,

  // Hard cap for the whole run (only really matters in CI)
  globalTimeout: CI ? 60 * 60 * 1000 : undefined,

  fullyParallel: DETERMINISTIC ? false : true,
  workers: DETERMINISTIC ? 1 : CI ? 2 : 4,
  retries: DETERMINISTIC ? 0 : CI ? 2 : 0,
  forbidOnly: CI,

  expect: { timeout: 15_000 },

  // Keep console output sane but still have an HTML report
  reporter: [
    [CI ? "dot" : "list"],
    ["html", { open: "never", outputFolder: "tests/e2e/playwright-report" }],
  ],

  // Where traces / screenshots / videos go
  outputDir: "tests/e2e/.artifacts",

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
        command: USE_START
          ? `pnpm start:e2e -p ${PORT}`
          : `pnpm dev -p ${PORT}`,
        url: BASE_URL,
        timeout: 240_000,

        // ✅ Don't reuse servers in CI (stale server = flaky run)
        reuseExistingServer: !CI,

        env: {
          NODE_ENV: USE_START ? "production" : "development",
          NEXT_PUBLIC_E2E: "1",
          NEXT_IMAGE_UNOPTIMIZED: "1",
          PRIMARY_DOMAIN_ENFORCE: "0",
          PORT,
        },
      },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  globalSetup: "./tests/e2e/global-setup.ts",

  metadata: {
    baseURL: BASE_URL,
    mode: USING_EXTERNAL_SERVER ? "external" : USE_START ? "start" : "dev",
    ci: String(CI),
  },
});

export { AUTH_DIR, STORAGE_DEFAULT, STORAGE_ADMIN, STORAGE_USER };
