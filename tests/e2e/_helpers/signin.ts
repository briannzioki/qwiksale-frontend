// tests/e2e/_helpers/signin.ts
import { type Page, type Locator, type Response } from "@playwright/test";

export async function pickFirstVisible(
  candidates: Locator[],
  timeoutMs = 4000,
): Promise<Locator | null> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const loc of candidates) {
      if ((await loc.count()) > 0) {
        const first = loc.first();
        try {
          if (await first.isVisible()) return first;
        } catch {
          // ignore transient detached/timeout errors
        }
      }
    }
    if (Date.now() - start > timeoutMs) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

function isAuthRelatedUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.pathname.startsWith("/api/auth/");
  } catch {
    // relative url case (Playwright sometimes gives full url; sometimes not)
    return u.includes("/api/auth/");
  }
}

type CapturedAuthResponse = {
  url: string;
  status: number;
  location?: string;
};

type SignInOpts = {
  email: string;
  password: string;
  callbackUrl?: string;
  timeoutMs?: number;
};

type SessionJson =
  | null
  | {
      user?: {
        email?: string;
        id?: string;
        role?: string;
        isAdmin?: boolean;
        isSuperAdmin?: boolean;
      };
      expires?: string;
    };

function sameEmail(a?: string | null, b?: string | null) {
  const A = String(a || "").trim().toLowerCase();
  const B = String(b || "").trim().toLowerCase();
  return !!A && !!B && A === B;
}

function cleanCred(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  const lower = s.toLowerCase();
  if (!s || lower === "undefined" || lower === "null") return "";
  return s;
}

async function getSession(page: Page): Promise<SessionJson> {
  try {
    const res = await page.request.get("/api/auth/session", {
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

async function waitForSession(page: Page, timeoutMs: number): Promise<SessionJson> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await getSession(page);
    if (s?.user?.id) return s;
    await page.waitForTimeout(250);
  }
  return null;
}

async function waitForNoSession(page: Page, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await getSession(page);
    if (!s?.user?.id) return;
    await page.waitForTimeout(200);
  }
}

async function getCsrf(page: Page): Promise<string | null> {
  try {
    const res = await page.request.get("/api/auth/csrf", {
      failOnStatusCode: false,
      headers: { accept: "application/json", "cache-control": "no-store" },
    });
    if (res.status() !== 200) return null;
    const j = (await res.json().catch(() => null)) as any;
    return typeof j?.csrfToken === "string" ? j.csrfToken : null;
  } catch {
    return null;
  }
}

async function signOutViaApi(page: Page, timeoutMs: number): Promise<void> {
  const csrfToken = await getCsrf(page);

  // Best-effort signout via NextAuth endpoint
  if (csrfToken) {
    try {
      await page.request.post("/api/auth/signout", {
        form: {
          csrfToken,
          callbackUrl: "/signin",
        },
        failOnStatusCode: false,
        headers: { "cache-control": "no-store" },
      });
    } catch {
      // ignore
    }
  }

  // Clear cookies as a hard reset (prevents “sticky” jwt cookie issues in tests)
  try {
    await page.context().clearCookies();
  } catch {
    // ignore
  }

  // Confirm session is gone (best-effort)
  await waitForNoSession(page, Math.min(timeoutMs, 6_000));
}

async function settleHydration(page: Page) {
  // Avoid filling inputs before React hydration finishes (controlled inputs can wipe values).
  // Keep this tiny and deterministic.
  try {
    await page.waitForTimeout(150);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  } catch {
    // ignore
  }
}

async function forceFillInput(page: Page, input: Locator, value: string) {
  const v = String(value ?? "");
  if (!v) return;

  // Try fill first (fast path)
  try {
    await input.fill(v);
  } catch {
    // fall through
  }

  // Verify it stuck; if not, use click + Ctrl+A + type (more resilient for controlled inputs)
  try {
    const cur = await input.inputValue().catch(() => "");
    if (String(cur || "").trim() === v.trim()) return;

    await input.click({ timeout: 1500 }).catch(() => {});
    await page.keyboard.press("Control+A").catch(() => {});
    await page.keyboard.type(v, { delay: 10 }).catch(() => {});

    const cur2 = await input.inputValue().catch(() => "");
    if (String(cur2 || "").trim() === v.trim()) return;

    // Last resort: set value via DOM + input event
    await input.evaluate((el, next) => {
      try {
        const e = el as HTMLInputElement;
        e.focus();
        e.value = String(next || "");
        e.dispatchEvent(new Event("input", { bubbles: true }));
        e.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {
        // ignore
      }
    }, v);
  } catch {
    // ignore
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

export async function signInViaUi(page: Page, opts: SignInOpts): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const callbackUrl = opts.callbackUrl ?? "/";

  const email = cleanCred(opts.email);
  const password = cleanCred(opts.password);

  if (!email || !password) {
    throw new Error(
      `Signin called with missing credentials. email=${email ? "(set)" : "(missing)"} password=${
        password ? "(set)" : "(missing)"
      }. Check E2E_USER_EMAIL/E2E_USER_PASSWORD and E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD.`,
    );
  }

  await page.goto(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`, {
    waitUntil: "domcontentloaded",
  });

  await settleHydration(page);

  // Temporary capture buffers (only used if sign-in fails)
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const authResponses: CapturedAuthResponse[] = [];

  const onConsole = (msg: any) => {
    try {
      consoleLines.push(`[console:${msg.type?.() ?? "log"}] ${msg.text?.() ?? String(msg)}`);
      if (consoleLines.length > 40) consoleLines.shift();
    } catch {
      // ignore
    }
  };

  const onPageError = (err: any) => {
    pageErrors.push(`[pageerror] ${String(err?.message ?? err)}`);
    if (pageErrors.length > 20) pageErrors.shift();
  };

  const onResponse = (res: Response) => {
    const url = res.url();
    if (!isAuthRelatedUrl(url)) return;

    const headers = res.headers();
    const location = headers["location"];

    // exactOptionalPropertyTypes: only include optional keys when defined
    if (typeof location === "string" && location.length > 0) {
      authResponses.push({ url, status: res.status(), location });
    } else {
      authResponses.push({ url, status: res.status() });
    }

    if (authResponses.length > 20) authResponses.shift();
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  try {
    // If /signin redirects away (already signed in), treat it as success *only* if session matches.
    const startUrl = new URL(page.url());
    const onSignin =
      /\/signin(\?|$)/i.test(startUrl.pathname + startUrl.search) ||
      /\/signin$/i.test(startUrl.pathname);

    if (!onSignin) {
      const s = await getSession(page);
      const sessionEmail = s?.user?.email;

      if (s?.user?.id && sameEmail(sessionEmail, email)) {
        return;
      }

      // Signed in as a different user -> sign out and retry /signin
      if (s?.user?.id && !sameEmail(sessionEmail, email)) {
        await signOutViaApi(page, timeoutMs);

        await page.goto(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`, {
          waitUntil: "domcontentloaded",
        });
        await settleHydration(page);
      } else {
        // Not on /signin but also no session: force /signin
        await page.goto(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`, {
          waitUntil: "domcontentloaded",
        });
        await settleHydration(page);
      }
    }

    // Prefer a stable form root if present (your app now provides this).
    await page
      .locator('[data-testid="signin-form"]')
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});

    const emailInput =
      (await pickFirstVisible([
        page.locator('[data-testid="signin-email"]'),
        page.getByLabel(/email/i),
        page.locator('input[type="email"]'),
        page.locator('input[name="email"]'),
        page.locator('input[autocomplete="email"]'),
        page.getByPlaceholder(/email/i),
      ])) ?? null;

    const passwordInput =
      (await pickFirstVisible([
        page.locator('[data-testid="signin-password"]'),
        page.getByLabel(/password/i),
        page.locator('input[type="password"]'),
        page.locator('input[name="password"]'),
        page.locator('input[autocomplete="current-password"]'),
        page.getByPlaceholder(/password/i),
      ])) ?? null;

    if (!emailInput || !passwordInput) {
      // One more: could still be redirected off /signin due to existing session.
      const s = await getSession(page);
      const sessionEmail = s?.user?.email;

      if (s?.user?.id && sameEmail(sessionEmail, email)) {
        return;
      }

      if (s?.user?.id && !sameEmail(sessionEmail, email)) {
        await signOutViaApi(page, timeoutMs);

        await page.goto(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`, {
          waitUntil: "domcontentloaded",
        });
        await settleHydration(page);
      }

      throw new Error("Signin form not detected (missing email/password inputs).");
    }

    // Hydration can wipe controlled inputs. Fill + verify + retry if needed.
    await forceFillInput(page, emailInput, email);
    await forceFillInput(page, passwordInput, password);

    // Find the submit button in the same form as the email input if possible.
    const form = emailInput.locator("xpath=ancestor::form[1]");
    const submitBtn =
      (await pickFirstVisible([
        form.locator('[data-testid="signin-submit"]'),
        form.locator('button[type="submit"]'),
        form.getByRole("button", { name: /sign in|log in|login/i }),
        // Fallbacks if no <form> exists (custom layout)
        page.locator('[data-testid="signin-submit"]'),
        page.locator('button[type="submit"]'),
        page.getByRole("button", { name: /sign in|log in|login/i }),
      ])) ?? null;

    if (!submitBtn) {
      throw new Error("Signin submit button not detected.");
    }

    const failureAlert = page
      .getByRole("alert")
      .filter({
        hasText: /sign[-\s]?in failed|invalid|incorrect|error|try again|enter your email|enter your password/i,
      })
      .first();

    await submitBtn.click();

    // Detect GET form submission leak: /signin?email=...&password=...
    await page.waitForTimeout(200);

    const urlNow = new URL(page.url());
    const looksLikeGetSubmitLeak =
      /\/signin$/i.test(urlNow.pathname) &&
      (urlNow.searchParams.has("email") || urlNow.searchParams.has("password"));

    if (looksLikeGetSubmitLeak) {
      throw new Error(
        "Signin submitted as GET back to /signin (email/password appeared in the URL). " +
          "This means your <form> submit is not prevented or method/action is wrong. " +
          "Fix the /signin form to call the real auth handler and redirect to callbackUrl.",
      );
    }

    const gotSession = waitForSession(page, timeoutMs).then(() => "session" as const);

    const leftSignin = page
      .waitForURL((u) => !/\/signin(\?|$)/i.test(u.pathname + u.search), { timeout: timeoutMs })
      .then(() => "left" as const);

    const showedFailure = failureAlert.waitFor({ state: "visible", timeout: timeoutMs }).then(() => "failed" as const);

    const outcome = await Promise.race([gotSession, leftSignin, showedFailure]).catch(() => null);

    if (outcome === "failed") {
      const alertText = (await failureAlert.textContent().catch(() => ""))?.trim() ?? "";
      throw new Error(`Signin failed UI alert: ${alertText || "(no text)"}`);
    }

    if (outcome === "session") return;

    if (outcome === "left") {
      // URL left /signin; confirm session actually exists (more reliable than URL)
      const s = await waitForSession(page, 3_000);
      if (s?.user?.id) return;
      throw new Error("Signin navigated away from /signin but session is still null.");
    }

    throw new Error("Signin did not complete (still no session and no failure alert detected).");
  } catch (e: any) {
    const parts: string[] = [];
    parts.push(`[e2e-signin] ${String(e?.message ?? e)}`);
    parts.push(`[e2e-signin] finalURL=${page.url()}`);

    if (authResponses.length) {
      parts.push(
        `[e2e-signin] authResponses=` +
          authResponses.map((r) => `${r.status} ${r.url}${r.location ? ` -> ${r.location}` : ""}`).join(" | "),
      );
    } else {
      parts.push("[e2e-signin] authResponses=(none captured)");
    }

    if (pageErrors.length) parts.push(`[e2e-signin] pageErrors=` + pageErrors.join(" | "));
    if (consoleLines.length) parts.push(`[e2e-signin] consoleTail=` + consoleLines.join(" | "));

    // Helpful hint if the server redirected back to /signin?error=...
    for (const r of authResponses) {
      if (!r.location) continue;
      const abs = r.location.startsWith("http") ? r.location : r.location;
      const err = looksLikeAuthErrorRedirect(abs);
      if (err) {
        parts.push(`[e2e-signin] authRedirectError=${err}`);
        break;
      }
    }

    throw new Error(parts.join("\n"));
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}
