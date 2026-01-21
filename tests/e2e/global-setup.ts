/* eslint-disable no-console */
// tests/e2e/global-setup.ts
import * as dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.e2e.local"), override: true });
dotenv.config();

import { execSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";
import { chromium, type BrowserContext, type APIResponse } from "@playwright/test";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const AUTH_DIR = path.resolve(process.cwd(), "tests/e2e/.auth");
const ADMIN_FILE = path.join(AUTH_DIR, "admin.json");
const USER_FILE = path.join(AUTH_DIR, "user.json");
const DEFAULT_FILE = path.join(AUTH_DIR, "state.json");

function runCmd(cmd: string) {
  execSync(cmd, { stdio: "inherit", env: process.env });
}

/**
 * Ensure the E2E database schema exists before any test hits Prisma-backed routes.
 * - Prefer `migrate deploy`
 * - Fallback to `db push` (useful when migrations are missing or you’re iterating locally)
 */
function ensureDbSchema() {
  console.log("[global-setup] prisma: ensuring DB schema (migrate deploy -> db push fallback)");

  try {
    console.log("[global-setup] prisma migrate deploy");
    runCmd("pnpm exec prisma migrate deploy");
    return;
  } catch (e) {
    console.warn("[global-setup] prisma migrate deploy failed; falling back to prisma db push");
  }

  // Fallback
  try {
    console.log("[global-setup] prisma db push --skip-generate");
    runCmd("pnpm exec prisma db push --skip-generate");
  } catch (e2) {
    console.error("[global-setup] prisma db push failed; cannot continue.");
    throw e2;
  }
}

async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
}

async function writeFileIfChanged(filePath: string, contents: string) {
  try {
    const existing = await fs.promises.readFile(filePath, "utf8");
    if (existing === contents) return;
  } catch {
    // ignore missing/unreadable -> will write
  }
  await fs.promises.writeFile(filePath, contents, "utf8");
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

function envBool(name: string): boolean {
  const v = process.env[name];
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isE2Eish(): boolean {
  return (
    envBool("NEXT_PUBLIC_E2E") ||
    envBool("E2E") ||
    envBool("E2E_MODE") ||
    envBool("PLAYWRIGHT") ||
    envBool("PLAYWRIGHT_TEST") ||
    envBool("PW_TEST")
  );
}

function normalizeEmail(v?: string | null): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s ? s : null;
}

function splitList(v?: string | null) {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_ALLOW = new Set(splitList(process.env["ADMIN_EMAILS"]));
const SUPERADMIN_ALLOW = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));

function isHttpBaseUrl(baseURL: string): boolean {
  try {
    return new URL(baseURL).protocol === "http:";
  } catch {
    return baseURL.startsWith("http://");
  }
}

function warnIfSecureCookiesOnHttp(baseURL: string, res: APIResponse, label: string) {
  if (!isHttpBaseUrl(baseURL)) return;

  const headers = res.headers();
  const setCookie = headers["set-cookie"] || headers["Set-Cookie"];
  if (!setCookie) return;

  const text = String(setCookie);
  if (/;\s*secure\b/i.test(text)) {
    console.warn(
      `[global-setup] WARNING: ${label} response set Secure cookies while baseURL is http. ` +
        `Those cookies won't be stored on http. Check NEXTAUTH_URL/AUTH_URL and cookie config for E2E.`,
    );
  }
}

type SessionJson =
  | null
  | {
      user?: { email?: string; id?: string } | null;
      expires?: string;
    };

function sameEmail(a?: string | null, b?: string | null) {
  const A = String(a || "").trim().toLowerCase();
  const B = String(b || "").trim().toLowerCase();
  return !!A && !!B && A === B;
}

async function getSession(ctx: BrowserContext): Promise<SessionJson> {
  try {
    const res = await ctx.request.get("/api/auth/session", {
      failOnStatusCode: false,
      headers: { accept: "application/json", "cache-control": "no-store" },
    });
    if (res.status() !== 200) return null;
    const j = (await res.json().catch(() => null)) as SessionJson;
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

async function hasSession(ctx: BrowserContext): Promise<boolean> {
  try {
    const j = await getSession(ctx);
    return !!(j as any)?.user;
  } catch {
    return false;
  }
}

function emptyStorageStateJson() {
  return JSON.stringify({ cookies: [], origins: [] as any[] }, null, 2);
}

async function ensureUserStateFileExists(userValid: boolean) {
  // Regression-safe: never allow ENOENT cascades for user.json.
  // If we failed to create a valid authed user state, write an EMPTY storage state file
  // so tests fail by assertions (not by missing file).
  if (userValid) return;

  await ensureDir(AUTH_DIR);

  const body = emptyStorageStateJson();
  await writeFileIfChanged(USER_FILE, body);

  console.warn(
    `[global-setup] wrote EMPTY user storage at ${USER_FILE} (login failed or invalid session). ` +
      `Tests that require an authenticated user may fail until E2E_USER_EMAIL/E2E_USER_PASSWORD are correct.`,
  );
}

/* ------------------------------- CSRF retry -------------------------------- */
async function getCsrfWithRetry(
  baseURL: string,
  ctx: BrowserContext,
  attempts = 3,
  delayMs = 400,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const res = await ctx.request.get("/api/auth/csrf", {
      failOnStatusCode: false,
      headers: { accept: "application/json", "cache-control": "no-store" },
    });

    warnIfSecureCookiesOnHttp(baseURL, res, "csrf");

    if (res.status() === 200) {
      try {
        const body = await res.json();
        const token = (body as any)?.csrfToken;
        if (token) {
          const jar = await ctx.cookies();
          const hasCsrfCookie = jar.some((c) => /csrf-token/i.test(c.name));
          if (!hasCsrfCookie) {
            console.warn(
              `[global-setup] csrf token received but csrf cookie is NOT present in context jar (cookie policy / secure-cookie / domain mismatch).`,
            );
          }
          return token as string;
        }
      } catch {
        // fall through
      }
    } else {
      console.warn(
        `[global-setup] csrf GET failed (${res.status()}) [attempt ${i + 1}/${attempts}]`,
      );
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function validateStoredState(
  baseURL: string,
  statePath: string,
  expectedEmail?: string,
): Promise<boolean> {
  try {
    await fs.promises.access(statePath, fs.constants.R_OK);
  } catch {
    return false;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL, storageState: statePath });

  try {
    const s = await getSession(context);
    const ok = !!s?.user;

    if (!ok) {
      console.warn(
        `[global-setup] stored auth state invalid (no session): ${path.basename(statePath)} — deleting`,
      );
      try {
        await fs.promises.rm(statePath, { force: true });
      } catch {}
      return false;
    }

    const actualEmail = String((s as any)?.user?.email || "").trim().toLowerCase();
    const exp = String(expectedEmail || "").trim().toLowerCase();

    if (exp && !sameEmail(actualEmail, exp)) {
      console.warn(
        `[global-setup] stored auth state invalid (session user mismatch): ${path.basename(statePath)} ` +
          `expected=${exp} actual=${actualEmail || "(missing)"} — deleting`,
      );
      try {
        await fs.promises.rm(statePath, { force: true });
      } catch {}
      return false;
    }

    console.log(`[global-setup] validated existing auth state: ${path.basename(statePath)}`);
    return true;
  } catch {
    try {
      await fs.promises.rm(statePath, { force: true });
    } catch {}
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

function looksLikeAuthErrorRedirect(urlLike: string): string | null {
  try {
    const u = new URL(urlLike);
    if (u.pathname !== "/signin") return null;
    const err = u.searchParams.get("error");
    return err ? err : "UnknownAuthError";
  } catch {
    if (urlLike.includes("/signin") && urlLike.includes("error=")) return "UnknownAuthError";
    return null;
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
  outFile: string,
): Promise<boolean> {
  if (!email || !password) return false;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });

  try {
    // Warm up server (ignore if missing)
    await context.request.get("/api/health", { failOnStatusCode: false }).catch(() => {});

    // CSRF with small retry/backoff
    const csrfToken = await getCsrfWithRetry(baseURL, context, 3, 400);
    if (!csrfToken) {
      console.warn(`[global-setup] csrf GET failed (no token) for ${email}`);
      return false;
    }

    const form = new URLSearchParams();
    form.set("csrfToken", csrfToken);
    form.set("email", email);
    form.set("password", password);
    form.set("callbackUrl", "/api/auth/session");

    const signRes = await context.request.post("/api/auth/callback/credentials", {
      headers: {
        accept: "text/html,application/json",
        "cache-control": "no-store",
        "content-type": "application/x-www-form-urlencoded",
      },
      data: form.toString(),
      failOnStatusCode: false,
    });

    warnIfSecureCookiesOnHttp(baseURL, signRes, "credentials callback");

    const location = (signRes.headers() as any)?.location;
    if (typeof location === "string" && location) {
      const abs = location.startsWith("http") ? location : new URL(location, baseURL).toString();
      const locErr = looksLikeAuthErrorRedirect(abs);
      if (locErr) {
        console.warn(
          `[global-setup] sign-in Location points to /signin with error=${locErr}. location=${location}`,
        );
        return false;
      }
    }

    if (signRes.status() >= 400) {
      let detail = "";
      try {
        detail = JSON.stringify(await signRes.json());
      } catch {
        // ignore
      }
      console.warn(
        `[global-setup] sign-in POST failed for ${email}: ${signRes.status()} ${detail || "(no body)"}`,
      );
      return false;
    }

    const ok = await hasSession(context);
    if (!ok) {
      const jar = await context.cookies().catch(() => []);
      const cookieNames = jar.map((c) => c.name).slice(0, 20).join(", ");
      console.warn(
        "[global-setup] session not detected via /api/auth/session after sign-in. " +
          `Cookies seen: ${cookieNames || "(none)"}`,
      );
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
  const body = emptyStorageStateJson();
  await writeFileIfChanged(DEFAULT_FILE, body);
  console.warn(`[global-setup] ensured EMPTY default storage at ${DEFAULT_FILE} (logged-out mode)`);
}

/**
 * Optionally seed the default storage from an existing admin/user state.
 * Controlled by E2E_DEFAULT_ROLE=("user"|"admin").
 * Falls back to empty guest state if not configured or seeding fails.
 */
async function seedDefaultState(adminValid: boolean, userValid: boolean): Promise<void> {
  await ensureDir(AUTH_DIR);

  const role = (process.env["E2E_DEFAULT_ROLE"] || "").toLowerCase();
  let sourcePath: string | null = null;

  if (role === "admin" && adminValid) {
    sourcePath = ADMIN_FILE;
  } else if (role === "user" && userValid) {
    sourcePath = USER_FILE;
  }

  if (sourcePath) {
    try {
      const raw = await fs.promises.readFile(sourcePath, "utf8");
      await writeFileIfChanged(DEFAULT_FILE, raw);
      console.log(
        `[global-setup] default storage seeded from ${path.basename(sourcePath)} (E2E_DEFAULT_ROLE=${role})`,
      );
      return;
    } catch (e) {
      console.warn(
        `[global-setup] failed to seed default storage from ${sourcePath}:`,
        (e as Error)?.message,
      );
    }
  }

  await writeEmptyDefault();
}

function maybeSetAuthUrlEnv(baseURL: string) {
  // Helps when Playwright webServer inherits env from this process.
  // Safe: only sets if missing.
  if (!process.env["PLAYWRIGHT_BASE_URL"]) process.env["PLAYWRIGHT_BASE_URL"] = baseURL;
  if (!process.env["E2E_BASE_URL"]) process.env["E2E_BASE_URL"] = baseURL;

  // next-auth v4 uses NEXTAUTH_URL; v5 uses AUTH_URL.
  if (!process.env["NEXTAUTH_URL"]) process.env["NEXTAUTH_URL"] = baseURL;
  if (!process.env["AUTH_URL"]) process.env["AUTH_URL"] = baseURL;
}

/**
 * If the configured E2E_USER_EMAIL is admin-ish by DB role (ADMIN/SUPERADMIN),
 * demote it to USER for the duration of E2E runs so admin guardrail tests can be meaningful.
 *
 * This is gated to E2E-ish runs + non-production to avoid surprising behavior.
 * You can disable by setting E2E_AUTOFIX_USER_ROLE=0.
 */
async function maybeDemoteE2EUserRoleToUser(userEmailRaw: string | undefined) {
  const email = normalizeEmail(userEmailRaw);
  if (!email) return;

  if (process.env.NODE_ENV === "production") return;
  if (!isE2Eish()) return;

  const autoFix = String(process.env["E2E_AUTOFIX_USER_ROLE"] ?? "1").trim() !== "0";
  if (!autoFix) return;

  const allowlisted = ADMIN_ALLOW.has(email) || SUPERADMIN_ALLOW.has(email);
  if (allowlisted) {
    console.warn(
      `[global-setup] WARNING: E2E_USER_EMAIL is present in ADMIN_EMAILS/SUPERADMIN_EMAILS allowlists (${email}). ` +
        `Admin guardrail tests will fail until you remove it from allowlists.`,
    );
    return;
  }

  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) return;

  let prisma: PrismaClient | null = null;
  try {
    prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } },
      log: [],
    });

    const row = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, email: true },
    });

    if (!row?.id) {
      console.warn(
        `[global-setup] WARNING: E2E_USER_EMAIL not found in DB (${email}). ` +
          `User state generation may fail unless the account exists.`,
      );
      return;
    }

    const role = String((row as any).role ?? "").toUpperCase().trim();
    if (role === "ADMIN" || role === "SUPERADMIN") {
      console.warn(
        `[global-setup] E2E_USER_EMAIL is admin by DB role (${email} role=${role}). Demoting to USER for E2E…`,
      );

      await prisma.user.update({
        where: { id: String(row.id) },
        data: { role: "USER" as any },
        select: { id: true },
      });

      // Ensure we don't reuse an old state token that was minted when the role was admin.
      try {
        await fs.promises.rm(USER_FILE, { force: true });
      } catch {
        // ignore
      }
    }
  } catch (e) {
    console.warn("[global-setup] WARNING: could not auto-demote E2E user role:", (e as any)?.message);
  } finally {
    try {
      await prisma?.$disconnect();
    } catch {
      // ignore
    }
  }
}

/**
 * Non-fatal diagnostics: tell you if the user storage can still access /admin.
 * (We do NOT delete files or throw here — per regression safety rule.)
 */
async function warnIfUserStateCanAccessAdmin(baseURL: string) {
  try {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ baseURL, storageState: USER_FILE });

    try {
      const page = await ctx.newPage();
      const resp = await page.goto("/admin", { waitUntil: "domcontentloaded" }).catch(() => null);

      const status = resp?.status() ?? 0;
      const pathname = new URL(page.url()).pathname;

      const stillOnAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
      const unauthorizedUI = await page
        .getByText(/(unauthorized|forbidden|not allowed|admin only|need to sign in)/i)
        .count()
        .catch(() => 0);

      const looksAllowed = stillOnAdmin && status === 200 && unauthorizedUI === 0;

      if (looksAllowed) {
        console.warn(
          `[global-setup] WARNING: USER storageState can access /admin (status=${status}, url=${page.url()}). ` +
            `Admin guardrail tests will fail until E2E_USER_EMAIL is a true non-admin (and not allowlisted).`,
        );
      }
      await page.close().catch(() => {});
    } finally {
      await ctx.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  } catch {
    // ignore diagnostics failures
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    (config.projects?.[0]?.use?.baseURL as string | undefined) ||
    process.env["E2E_BASE_URL"] ||
    process.env["PLAYWRIGHT_BASE_URL"] ||
    "http://localhost:3000";

  maybeSetAuthUrlEnv(baseURL);

  // ✅ Ensure DB schema before any auth/session calls or admin API requests.
  ensureDbSchema();

  await ensureDir(AUTH_DIR);

  const ADMIN_EMAIL = env("E2E_ADMIN_EMAIL") || env("E2E_SUPERADMIN_EMAIL") || "";
  const ADMIN_PASSWORD = env("E2E_ADMIN_PASSWORD") || env("E2E_SUPERADMIN_PASSWORD") || "";
  const USER_EMAIL = env("E2E_USER_EMAIL") || "";
  const USER_PASSWORD = env("E2E_USER_PASSWORD") || "";

  console.log("[global-setup] baseURL:", baseURL);
  console.log("[global-setup] NEXTAUTH_URL:", process.env["NEXTAUTH_URL"] ? "(set)" : "(missing)");
  console.log("[global-setup] AUTH_URL:", process.env["AUTH_URL"] ? "(set)" : "(missing)");
  console.log("[global-setup] DATABASE_URL:", process.env["DATABASE_URL"] ? "(set)" : "(missing)");
  console.log("[global-setup] admin present:", !!ADMIN_EMAIL, "user present:", !!USER_EMAIL);

  // ✅ Make guardrail tests meaningful by ensuring configured E2E user is not admin by DB role.
  await maybeDemoteE2EUserRoleToUser(USER_EMAIL);

  const adminValid =
    (await validateStoredState(baseURL, ADMIN_FILE, ADMIN_EMAIL)) ||
    (!!ADMIN_EMAIL &&
      !!ADMIN_PASSWORD &&
      (await loginAndSave(baseURL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FILE)));

  const userValid =
    (await validateStoredState(baseURL, USER_FILE, USER_EMAIL)) ||
    (!!USER_EMAIL && !!USER_PASSWORD && (await loginAndSave(baseURL, USER_EMAIL, USER_PASSWORD, USER_FILE)));

  // Regression-safe: ensure user.json exists even if invalid so tests don't crash with ENOENT.
  await ensureUserStateFileExists(userValid);

  // Optional but useful: warn loudly if the created/validated user state can access /admin.
  await warnIfUserStateCanAccessAdmin(baseURL);

  await seedDefaultState(adminValid, userValid);
}
