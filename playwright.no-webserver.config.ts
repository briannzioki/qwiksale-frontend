// ROOT: playwright.no-webserver.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',              // ← change this from 'tests'
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://qwiksale.sale',
    headless: true,
    trace: 'on-first-retry',
  },
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
