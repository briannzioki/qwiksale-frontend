/* eslint-disable no-console */
// tests/e2e/global-setup.ts
import * as dotenv from "dotenv";
import path from "node:path";

// Load env for Playwright
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config(); // also read .env

import type { FullConfig } from "@playwright/test";
import { chromium } from "@playwright/test";
import fs from "node:fs";

const AUTH_DIR = path.resolve("tests/e2e/.auth");
const ADMIN_FILE = path.join(AUTH_DIR, "admin.json");
const USER_FILE = path.join(AUTH_DIR, "user.json");
const DEFAULT_FILE = path.join(AUTH_DIR, "state.json");

async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
}

type Creds = { email?: string; password?: string };

async function hasSession(
  page: import("@playwright/test").Page
): Promise<boolean> {
  try {
    const res = await page.request.get("/api/me", { failOnStatusCode: false });
    return res.status() === 200;
  } catch {
    return false;
  }
}

async function waitForSession(
  page: import("@playwright/test").Page,
  timeoutMs = 20_000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await hasSession(page)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * Attempt to log in via the real UI and persist storage state.
 * We don't rely on URL redirects; we verify by polling /api/me.
 */
async function loginAndSave(baseURL: string, creds: Creds, outFile: string): Promise<boolean> {
  if (!creds.email || !creds.password) return false;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    // 1) Try common auth routes
    const candidates = ["/signin", "/auth/signin", "/login", "/auth/login"];
    let landed = false;
    for (const p of candidates) {
      try {
        await page.goto(p, { waitUntil: "domcontentloaded" });
        landed = true;
        break;
      } catch {
        /* try next */
      }
    }

    // 2) If none worked, try home then click a "Sign in" link
    if (!landed) {
      try {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        const signInLink = page.getByRole("link", { name: /sign in|log in/i }).first();
        if (await signInLink.count()) {
          await signInLink.click();
          landed = true;
        }
      } catch {
        /* ignore */
      }
    }

    if (!landed) throw new Error("could not reach a sign-in screen");

    // Fill — prefer labels, fallback to name selectors
    const emailInput = page.getByLabel(/email/i).first();
    const passInput = page.getByLabel(/password/i).first();

    if (await emailInput.count()) {
      await emailInput.fill(creds.email!);
    } else {
      await page
        .locator('input[name="email"], input[type="email"], #email, input[autocomplete="username"]')
        .first()
        .fill(creds.email!);
    }

    if (await passInput.count()) {
      await passInput.fill(creds.password!);
    } else {
      await page
        .locator('input[name="password"], input[type="password"], #password, input[autocomplete="current-password"]')
        .first()
        .fill(creds.password!);
    }

    // Submit
    const submitButton = page.getByRole("button", { name: /sign in|log in/i }).first();
    if (await submitButton.count()) {
      await submitButton.click();
    } else {
      await page.locator('button[type="submit"], input[type="submit"]').first().click();
    }

    // ✅ Verify session via /api/me
    const ok = await waitForSession(page, 20_000);
    if (!ok) throw new Error("session not detected via /api/me");

    await ensureDir(AUTH_DIR);
    await context.storageState({ path: outFile });
    console.log(`[global-setup] wrote storage: ${outFile}`);
    return true;
  } catch (e) {
    console.warn(`[global-setup] login failed for ${outFile}:`, (e as Error)?.message);
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function copyIfExists(src: string, dst: string): Promise<boolean> {
  try {
    await fs.promises.copyFile(src, dst);
    console.log(`[global-setup] wrote default storage: ${dst} (copied from ${path.basename(src)})`);
    return true;
  } catch {
    return false;
  }
}

async function writeEmptyDefault(): Promise<void> {
  await ensureDir(AUTH_DIR);
  const emptyState = { cookies: [], origins: [] };
  await fs.promises.writeFile(DEFAULT_FILE, JSON.stringify(emptyState, null, 2), "utf8");
  console.warn(
    `[global-setup] no auth states created — wrote EMPTY default storage at ${DEFAULT_FILE} (logged-out mode)`
  );
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    (config.projects?.[0]?.use?.baseURL as string | undefined) ||
    process.env["E2E_BASE_URL"] ||
    "http://localhost:3000";

  await ensureDir(AUTH_DIR);

  console.log("[global-setup] E2E_ADMIN_EMAIL present:", !!process.env["E2E_ADMIN_EMAIL"]);
  console.log("[global-setup] E2E_USER_EMAIL present:", !!process.env["E2E_USER_EMAIL"]);

  // Build creds without explicit `undefined`
  const adminCreds: Creds = {};
  const aEmail = process.env["E2E_ADMIN_EMAIL"];
  const aPass = process.env["E2E_ADMIN_PASSWORD"];
  if (aEmail) adminCreds.email = aEmail;
  if (aPass) adminCreds.password = aPass;

  const userCreds: Creds = {};
  const uEmail = process.env["E2E_USER_EMAIL"];
  const uPass = process.env["E2E_USER_PASSWORD"];
  if (uEmail) userCreds.email = uEmail;
  if (uPass) userCreds.password = uPass;

  const adminOk = await loginAndSave(baseURL, adminCreds, ADMIN_FILE);
  const userOk = await loginAndSave(baseURL, userCreds, USER_FILE);

  // 🔧 NEW: delete stale files if login failed
  if (!adminOk) { try { await fs.promises.rm(ADMIN_FILE, { force: true }); } catch {} }
  if (!userOk) { try { await fs.promises.rm(USER_FILE, { force: true }); } catch {} }

  // Choose default state
  if (userOk && (await copyIfExists(USER_FILE, DEFAULT_FILE))) return;
  if (adminOk && (await copyIfExists(ADMIN_FILE, DEFAULT_FILE))) return;

  await writeEmptyDefault();
}
