// playwright.no-webserver.config.ts
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.E2E_BASE_URL ||
  "https://qwiksale.sale";

const AUTH_DIR = path.resolve("tests/e2e/.auth");
const STORAGE_DEFAULT = path.join(AUTH_DIR, "state.json");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    storageState: STORAGE_DEFAULT,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
    // ✅ belongs under `use`, not top-level
    testIdAttribute: "data-testid",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuse the same globalSetup so we still mint storage files in hosted runs
  globalSetup: "./tests/e2e/global-setup.ts",
});
