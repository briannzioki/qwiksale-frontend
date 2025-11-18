/* eslint-disable no-console */
// tests/e2e/global-setup.ts
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.e2e.local") });
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
    return (
      process.env["E2E_SUPERADMIN_EMAIL"] ||
      (process.env as any)["2E_SUPERADMIN_EMAIL"] ||
      fallback
    );
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

/* ------------------------------- CSRF retry -------------------------------- */
async function getCsrfWithRetry(ctx: BrowserContext, attempts = 3, delayMs = 400): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const res = await ctx.request.get("/api/auth/csrf", { failOnStatusCode: false });
    if (res.status() === 200) {
      try {
        const body = await res.json();
        const token = (body as any)?.csrfToken;
        if (token) return token as string;
      } catch {
        /* fall through */
      }
    } else {
      console.warn(`[global-setup] csrf GET failed (${res.status()}) [attempt ${i + 1}/${attempts}]`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function validateStoredState(baseURL: string, statePath: string): Promise<boolean> {
  try {
    await fs.promises.access(statePath, fs.constants.R_OK);
  } catch {
    return false;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL, storageState: statePath });

  try {
    const ok = await hasSession(context);
    if (ok) {
      console.log(`[global-setup] validated existing auth state: ${path.basename(statePath)}`);
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Credentials login via NextAuth without UI.
 * IMPORTANT: callbackUrl points to /api/auth/session to avoid / → /admin loops.
 */
async function loginAndSave(
  baseURL: string,
  email: string,
  password: string,
  outFile: string
): Promise<boolean> {
  if (!email || !password) return false;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });

  try {
    // Warm up server
    await context.request.get("/api/health").catch(() => {});

    // CSRF with small retry/backoff
    const csrfToken = await getCsrfWithRetry(context, 3, 400);
    if (!csrfToken) {
      console.warn(`[global-setup] csrf GET failed (no token) for ${email}`);
      return false;
    }

    // Credentials sign-in -> redirect to /api/auth/session (NOT /)
    const form = new URLSearchParams();
    form.set("csrfToken", csrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("callbackUrl", "/api/auth/session");

    const signRes = await context.request.post("/api/auth/callback/credentials", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: form.toString(),
      failOnStatusCode: false,
    });

    if (signRes.status() >= 400) {
      let detail = "";
      try {
        detail = JSON.stringify(await signRes.json());
      } catch {}
      console.warn(
        `[global-setup] sign-in POST failed for ${email}: ${signRes.status()} ${detail || "(no body)"}`
      );
      return false;
    }

    // Verify session
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

async function writeEmptyDefault(): Promise<void> {
  await ensureDir(AUTH_DIR);
  const emptyState = { cookies: [], origins: [] as any[] };
  await fs.promises.writeFile(DEFAULT_FILE, JSON.stringify(emptyState, null, 2), "utf8");
  console.warn(
    `[global-setup] wrote EMPTY default storage at ${DEFAULT_FILE} (logged-out mode)`
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

  // Try to reuse/refresh dedicated states for admin and user
  const adminValid =
    (await validateStoredState(baseURL, ADMIN_FILE)) ||
    (!!ADMIN_EMAIL &&
      !!ADMIN_PASSWORD &&
      (await loginAndSave(baseURL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FILE)));

  const userValid =
    (await validateStoredState(baseURL, USER_FILE)) ||
    (!!USER_EMAIL && !!USER_PASSWORD && (await loginAndSave(baseURL, USER_EMAIL, USER_PASSWORD, USER_FILE)));

  if (!adminValid) {
    try {
      await fs.promises.rm(ADMIN_FILE, { force: true });
    } catch {}
  }
  if (!userValid) {
    try {
      await fs.promises.rm(USER_FILE, { force: true });
    } catch {}
  }

  // Always start suites in logged-out mode to avoid cookie bleed-through.
  await writeEmptyDefault();
}
