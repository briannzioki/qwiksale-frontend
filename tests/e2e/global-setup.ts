import { request, chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const STATE_PATH = path.join("tests", "e2e", ".auth", "state.json");

async function writeState(json: any) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(json, null, 2), "utf8");
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects?.[0]?.use?.baseURL?.toString() ||
    process.env['E2E_BASE_URL'] ||
    "http://localhost:3000";

  const email = process.env['E2E_EMAIL'] || "";
  const password = process.env['E2E_PASSWORD'] || "";

  const ctx = await request.newContext({ baseURL });
  let loggedIn = false;

  // ---------- Attempt API login via NextAuth Credentials ----------
  if (email && password) {
    try {
      const csrf = await ctx.get("/api/auth/csrf", { failOnStatusCode: false });
      if (csrf.ok()) {
        const { csrfToken } = await csrf.json();
        const candidates = [
          { idField: "email", pwField: "password" },
          { idField: "username", pwField: "password" },
          { idField: "email", pwField: "pass" }, // just in case
        ];

        for (const { idField, pwField } of candidates) {
          const body = new URLSearchParams();
          body.set("csrfToken", csrfToken);
          body.set("callbackUrl", "/");
          body.set("json", "true");
          body.set(idField, email);
          body.set(pwField, password);

          const res = await ctx.post("/api/auth/callback/credentials", {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: body.toString(),
            failOnStatusCode: false,
          });

          // When json=true, NextAuth responds 200 JSON. Verify session actually works:
          if (res.status() === 200) {
            const me = await ctx.get("/api/me", { failOnStatusCode: false });
            if (me.status() === 200) {
              loggedIn = true;
              break;
            }
          }
        }
      }
    } catch {
      // swallow: we'll try UI login below
    }
  }

  // ---------- Fallback: UI login (covers custom forms) ----------
  if (!loggedIn && email && password) {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const candidatePaths = ["/auth/signin", "/signin", "/login", "/auth/login"];
    for (const p of candidatePaths) {
      try {
        await page.goto(baseURL + p, { waitUntil: "domcontentloaded" });

        const emailSel =
          'input[name="email"], input[type="email"], input#email, input[autocomplete="username"]';
        const userSel = 'input[name="username"], input#username';
        const passSel =
          'input[name="password"], input[type="password"], input#password, input[autocomplete="current-password"]';

        const hasEmail = await page.locator(emailSel).first().count();
        const hasUser = await page.locator(userSel).first().count();
        const hasPass = await page.locator(passSel).first().count();
        if (!hasPass || (!hasEmail && !hasUser)) continue;

        if (hasEmail) await page.fill(emailSel, email);
        else await page.fill(userSel, email);
        await page.fill(passSel, password);

        const submit =
          'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), input[type="submit"]';
        await page.click(submit);
        await page.waitForLoadState("domcontentloaded");

        // Verify session by creating a request context with the UI cookies
        const state = await context.storageState();
        const verifyCtx = await request.newContext({ baseURL, storageState: state });
        const ok = await verifyCtx.get("/api/me", { failOnStatusCode: false });
        await verifyCtx.dispose();

        if (ok.status() === 200) {
          await writeState(state);
          await browser.close();
          await ctx.dispose();
          console.log(`Auth storageState written to ${STATE_PATH}`);
          return;
        }
      } catch {
        // try next path
      }
    }

    await browser.close();
  }

  // ---------- Persist storageState (logged-in or empty) ----------
  const state = await ctx.storageState();
  await writeState(state);
  await ctx.dispose();

  if (loggedIn) {
    console.log(`Auth storageState written to ${STATE_PATH}`);
  } else {
    console.warn(
      `Auth storageState (empty) written to ${STATE_PATH} — login not detected (status 401)`
    );
  }
}
