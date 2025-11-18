/* eslint-disable no-console */
// tests/e2e/global-setup.ts
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

import type { FullConfig } from "@playwright/test";
import { chromium, type BrowserContext } from "@playwright/test";
import fs from "node:fs";

const AUTH_DIR = path.resolve("tests/e2e/.auth");
const ADMIN_FILE = path.join(AUTH_DIR, "admin.json");
const USER_FILE = path.join(AUTH_DIR, "user.json");
const DEFAULT_FILE = path.join(AUTH_DIR, "state.json");

async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
}

function env(name: string, fallback?: string) {
  if (name === "E2E_SUPERADMIN_EMAIL") {
    return process.env["E2E_SUPERADMIN_EMAIL"] || (process.env as any)["2E_SUPERADMIN_EMAIL"] || fallback;
  }
  return (process.env as Record<string, string | undefined>)[name] ?? fallback;
}

async function hasSession(ctx: BrowserContext): Promise<boolean> {
  try {
    const res = await ctx.request.get("/api/auth/session", { failOnStatusCode: false });
    if (res.status() !== 200) return false;
    const j = await res.json();
    return !!(j as any)?.user;
  } catch {
    return false;
  }
}

/**
 * Credentials login via NextAuth without UI.
 * IMPORTANT: callbackUrl points to /api/auth/session to avoid any / → / loops.
 */
async function loginAndSave(baseURL: string, email: string, password: string, outFile: string): Promise<boolean> {
  if (!email || !password) return false;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });

  try {
    // Health ping so server is warm
    await context.request.get("/api/health").catch(() => {});

    // 1) Get CSRF
    const csrfRes = await context.request.get("/api/auth/csrf", { failOnStatusCode: false });
    if (csrfRes.status() !== 200) {
      console.warn(`[global-setup] csrf GET failed (${csrfRes.status()}) for ${email}`);
      return false;
    }
    const csrf = (await csrfRes.json()) as any;
    const csrfToken: string | undefined = csrf?.csrfToken;
    if (!csrfToken) {
      console.warn("[global-setup] no csrfToken in response");
      return false;
    }

    // 2) Credentials sign-in -> redirect to /api/auth/session (NOT /)
    const form = new URLSearchParams();
    form.set("csrfToken", csrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("callbackUrl", "/api/auth/session"); // 👈 avoid / redirect

    const signRes = await context.request.post("/api/auth/callback/credentials", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: form.toString(),
      failOnStatusCode: false,
    });

    if (signRes.status() >= 400) {
      let detail = "";
      try { detail = JSON.stringify(await signRes.json()); } catch {}
      console.warn(
        `[global-setup] sign-in POST failed for ${email}: ${signRes.status()} ${detail || "(no body)"}`
      );
      return false;
    }

    // 3) Verify
    const ok = await hasSession(context);
    if (!ok) {
      console.warn("[global-setup] session not detected via /api/auth/session");
      return false;
    }

    await ensureDir(AUTH_DIR);
    await context.storageState({ path: outFile });
    console.log(`[global-setup] wrote storage: ${outFile} for ${email}`);
    return true;
  } catch (e) {
    console.warn(`[global-setup] login failed for ${email}:`, (e as Error)?.message);
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

  const ADMIN_EMAIL = env("E2E_ADMIN_EMAIL") || env("E2E_SUPERADMIN_EMAIL") || "";
  const ADMIN_PASSWORD = env("E2E_ADMIN_PASSWORD") || env("E2E_SUPERADMIN_PASSWORD") || "";
  const USER_EMAIL = env("E2E_USER_EMAIL") || "";
  const USER_PASSWORD = env("E2E_USER_PASSWORD") || "";

  console.log("[global-setup] baseURL:", baseURL);
  console.log("[global-setup] admin present:", !!ADMIN_EMAIL, "user present:", !!USER_EMAIL);

  const adminOk = ADMIN_EMAIL && ADMIN_PASSWORD
    ? await loginAndSave(baseURL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FILE)
    : false;

  const userOk = USER_EMAIL && USER_PASSWORD
    ? await loginAndSave(baseURL, USER_EMAIL, USER_PASSWORD, USER_FILE)
    : false;

  if (!adminOk) { try { await fs.promises.rm(ADMIN_FILE, { force: true }); } catch {} }
  if (!userOk) { try { await fs.promises.rm(USER_FILE, { force: true }); } catch {} }

  if (userOk && (await copyIfExists(USER_FILE, DEFAULT_FILE))) return;
  if (adminOk && (await copyIfExists(ADMIN_FILE, DEFAULT_FILE))) return;

  await writeEmptyDefault();
}
