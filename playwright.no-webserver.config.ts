// ROOT: playwright.no-webserver.config.ts
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
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "on-first-retry",
    storageState: STORAGE_DEFAULT,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuse the same globalSetup so we still mint storage files in hosted runs
  globalSetup: "./tests/e2e/global-setup.ts",
});
