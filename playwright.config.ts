import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.e2e.local"), override: true });
dotenv.config();

const CI = !!process.env.CI;
const PORT = String(process.env.PORT || 3000);

// Prefer explicit E2E URLs when provided, but also honor PLAYWRIGHT_BASE_URL if present.
const BASE_URL =
  process.env.E2E_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.NEXT_PUBLIC_PLAYWRIGHT_BASE_URL ||
  `http://localhost:${PORT}`;

const DETERMINISTIC = process.env.E2E_DETERMINISTIC === "1";

// External server only when a base URL is provided
const USING_EXTERNAL_SERVER = !!process.env.E2E_BASE_URL;

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const IS_HTTPS = isHttpsUrl(BASE_URL);

// Explicitly force dev mode (but still let Playwright start it via webServer)
const FORCE_DEV = process.env.USE_DEV === "1";

// Use production start (built app) in CI or when E2E_PROD=1 (unless dev forced)
const USE_START = !FORCE_DEV && (process.env.E2E_PROD === "1" || CI);

const AUTH_DIR = path.resolve("tests/e2e/.auth");
const STORAGE_DEFAULT = path.join(AUTH_DIR, "state.json");
const STORAGE_ADMIN = path.join(AUTH_DIR, "admin.json");
const STORAGE_USER = path.join(AUTH_DIR, "user.json");

const STABLE_SECRET =
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-secret-change-me";

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

    // Default is logged-out storage (global-setup ensures this file exists)
    storageState: STORAGE_DEFAULT,

    actionTimeout: 10_000,
    navigationTimeout: 30_000,

    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    ignoreHTTPSErrors: true,

    testIdAttribute: "data-testid",
  },

  webServer: USING_EXTERNAL_SERVER
    ? undefined
    : {
        command: USE_START
          ? `pnpm run build && pnpm run start:e2e`
          : `node -e "require('fs').rmSync('.next',{recursive:true,force:true})" && pnpm run dev`,
        url: BASE_URL,
        timeout: 240_000,
        reuseExistingServer: !CI,

        // Critical: keep Auth + Playwright in agreement on host/secure cookies for localhost/http.
        env: {
          // ---- determinism: secrets + e2e creds must exist in the SERVER process ----
          AUTH_SECRET: STABLE_SECRET,
          NEXTAUTH_SECRET: STABLE_SECRET,

          E2E_USER_EMAIL: process.env.E2E_USER_EMAIL || "",
          E2E_USER_PASSWORD: process.env.E2E_USER_PASSWORD || "",
          E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL || "",
          E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || "",
          E2E_SUPERADMIN_EMAIL: process.env.E2E_SUPERADMIN_EMAIL || "",
          E2E_SUPERADMIN_PASSWORD: process.env.E2E_SUPERADMIN_PASSWORD || "",

          NODE_ENV: USE_START ? "production" : "development",
          NEXT_PUBLIC_E2E: "1",
          E2E: "1",
          E2E_MODE: "1",
          PLAYWRIGHT: "1",

          NEXT_IMAGE_UNOPTIMIZED: "1",
          PRIMARY_DOMAIN_ENFORCE: "0",
          PORT,

          // Make NextAuth/Auth.js host resolution deterministic in E2E.
          NEXTAUTH_URL: BASE_URL,
          NEXTAUTH_URL_INTERNAL: BASE_URL,
          AUTH_URL: BASE_URL,
          AUTH_TRUST_HOST: "true",

          // Stop secure-cookie rejection on http://localhost in start mode.
          AUTH_COOKIE_SECURE: IS_HTTPS ? "1" : "0",
        },
      },

  // IMPORTANT:
  // Having multiple projects means "playwright test" runs each test once per project.
  // Use --project=chromium (logged-out), --project=chromium-user, --project=chromium-admin
  // when you want one pass.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_DEFAULT,
      },
    },
    {
      name: "chromium-user",
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_USER,
      },
    },
    {
      name: "chromium-admin",
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_ADMIN,
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
