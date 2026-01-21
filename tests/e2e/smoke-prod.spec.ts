// tests/e2e/smoke-prod.spec.ts
import { test, expect, type Page, type Locator } from "@playwright/test";
import { waitForServerReady, gotoHome } from "./utils/server";

async function getAnyProductId(page: Page): Promise<string | undefined> {
  const candidates: Array<() => Promise<string | undefined>> = [
    async () => {
      const res = await page.request.get("/api/home-feed?t=products&limit=1", {
        timeout: 30_000,
      });
      const json = (await res.json().catch(() => ({} as any))) as any;
      return json?.items?.[0]?.id as string | undefined;
    },
    async () => {
      const res = await page.request.get("/api/products?pageSize=1", {
        timeout: 30_000,
      });
      const json = (await res.json().catch(() => ({} as any))) as any;
      return json?.items?.[0]?.id as string | undefined;
    },
  ];

  for (const fn of candidates) {
    try {
      const id = await fn();
      if (id) return id;
    } catch {
      // ignore and try next source
    }
  }

  return undefined;
}

async function getAnyServiceId(page: Page): Promise<string | undefined> {
  const candidates: Array<() => Promise<string | undefined>> = [
    async () => {
      const res = await page.request.get("/api/home-feed?t=services&limit=1", {
        timeout: 30_000,
      });
      const json = (await res.json().catch(() => ({} as any))) as any;
      return json?.items?.[0]?.id as string | undefined;
    },
    async () => {
      const res = await page.request.get("/api/services?pageSize=1", {
        timeout: 30_000,
      });
      const json = (await res.json().catch(() => ({} as any))) as any;
      return json?.items?.[0]?.id as string | undefined;
    },
  ];

  for (const fn of candidates) {
    try {
      const id = await fn();
      if (id) return id;
    } catch {
      // ignore and try next source
    }
  }

  return undefined;
}

async function findVisibleSearchInput(page: Page): Promise<Locator> {
  // Prefer the Home filters search input (stable and not the header inline input).
  const filtersRegion = page.getByRole("region", { name: /filters/i }).first();
  const homeSearch = filtersRegion.locator('input[placeholder*="Search"]').first();

  const homeVisible = await homeSearch
    .waitFor({ state: "visible", timeout: 6_000 })
    .then(() => true)
    .catch(() => false);

  if (homeVisible) return homeSearch;

  // Fallback to header search input if the Home filters are not present yet.
  const headerSearch = page.getByTestId("header-inline-search-input").first();
  const headerVisible = await headerSearch
    .waitFor({ state: "visible", timeout: 6_000 })
    .then(() => true)
    .catch(() => false);

  if (headerVisible) return headerSearch;

  // Last resort: return the Home search locator so the failure message points to the intended control.
  return homeSearch;
}

async function findContactCta(page: Page): Promise<Locator> {
  const re =
    /message provider|contact provider|chat with provider|message seller|contact seller|chat with seller|message|contact|chat/i;

  const button = page.getByRole("button", { name: re }).first();
  if ((await button.count()) > 0 && (await button.isVisible().catch(() => false))) return button;

  const link = page.getByRole("link", { name: re }).first();
  if ((await link.count()) > 0 && (await link.isVisible().catch(() => false))) return link;

  const signIn = page.getByRole("link", { name: /sign in/i }).first();
  if ((await signIn.count()) > 0 && (await signIn.isVisible().catch(() => false))) return signIn;

  // Ensure a concrete Locator is returned even with strict index typing.
  return page.getByRole("button", { name: re }).first();
}

async function expectServicePageLoaded(page: Page) {
  const notFoundHeading = page.getByRole("heading", { name: /we can.t find that page/i }).first();
  if (await notFoundHeading.isVisible().catch(() => false)) {
    throw new Error("Service page returned not found UI");
  }

  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator("text=Application error")).toHaveCount(0);

  const msgCta = await findContactCta(page);
  await expect(msgCta).toBeVisible();
}

const hasGoogleEnv =
  !!process.env["GOOGLE_CLIENT_ID"] && !!process.env["GOOGLE_CLIENT_SECRET"];

test.describe("Prod smoke: core public journeys", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await waitForServerReady(page);
    } finally {
      await page.close();
    }
  });

  test("Home page renders hero and search without error overlay", async ({ page }) => {
    await gotoHome(page);

    await expect(
      page.getByRole("heading", { name: /qwiksale|sell faster|buy smarter/i }).first(),
    ).toBeVisible();

    const searchBox = await findVisibleSearchInput(page);
    await expect(searchBox).toBeVisible();

    await expect(page.locator("text=Application error")).toHaveCount(0);
  });

  test("Key marketing pages render without 500", async ({ page }) => {
    const routes: Array<{ path: string; heading: RegExp }> = [
      { path: "/help", heading: /help|faq|support/i },
      { path: "/contact", heading: /contact|get in touch/i },
      { path: "/about", heading: /about|qwiksale/i },
    ];

    for (const { path, heading } of routes) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(resp?.status(), `GET ${path} status`).toBeLessThan(500);

      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await expect(page.locator("text=Application error")).toHaveCount(0);
    }
  });

  test("Product detail page works for at least one product and links to store", async ({ page }) => {
    const productId = await getAnyProductId(page);
    test.skip(!productId, "No product available in home feed or /api/products; seed at least one.");

    const url = `/product/${productId}`;
    const resp = await page.goto(url, { waitUntil: "domcontentloaded" });

    expect(resp?.ok(), `GET ${url} should be OK`).toBe(true);

    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("text=Application error")).toHaveCount(0);

    const msgCta = await findContactCta(page);
    await expect(msgCta).toBeVisible();

    const storeLink = page
      .getByRole("link", { name: /visit store|view store|more from this seller|seller store/i })
      .first();

    if ((await storeLink.count()) > 0) {
      const hostBefore = new URL(page.url()).host;

      await Promise.all([page.waitForURL(/\/store\//), storeLink.click()]);
      expect(new URL(page.url()).host).toBe(hostBefore);

      await expect(page.getByRole("heading", { name: /store|seller|listings by/i }).first()).toBeVisible();
      await expect(page.locator("text=Application error")).toHaveCount(0);
    }
  });

  test("Service detail page works for at least one service", async ({ page }) => {
    const serviceId = await getAnyServiceId(page);
    test.skip(!serviceId, "No service available in home feed or /api/services; seed at least one.");

    const primary = `/service/${serviceId}`;

    const resp1 = await page.goto(primary, { waitUntil: "domcontentloaded" });
    expect(resp1, `No navigation response from ${primary}`).toBeTruthy();

    const status1 = resp1!.status();
    if (status1 >= 500) {
      throw new Error(`Service route returned ${status1} for ${primary}`);
    }

    const notFoundUi =
      (await page.getByRole("heading", { name: /we can.t find that page/i }).first().isVisible().catch(() => false)) ||
      (await page.getByText(/404\s*-\s*not found/i).first().isVisible().catch(() => false));

    if (!notFoundUi) {
      await expectServicePageLoaded(page);
      return;
    }

    const svcRes = await page.request.get("/api/services?pageSize=8", { timeout: 30_000 }).catch(() => null);
    if (!svcRes || !svcRes.ok()) {
      throw new Error("Service route returned not found UI and could not fetch fallback /api/services list");
    }

    const svcJson = (await svcRes.json().catch(() => ({} as any))) as any;
    const items: any[] = Array.isArray(svcJson?.items) ? svcJson.items : [];
    const ids: string[] = items
      .map((x) => (x?.id != null ? String(x.id) : ""))
      .filter(Boolean)
      .slice(0, 8);

    test.skip(!ids.length, "No services returned from /api/services to use as fallback candidates.");

    let lastStatus = 0;
    let lastUrl = "";
    for (const id of ids) {
      const url = `/service/${id}`;
      lastUrl = url;

      const resp = await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => null);
      if (!resp) continue;

      lastStatus = resp.status();
      if (lastStatus >= 500) continue;

      const nf = await page.getByRole("heading", { name: /we can.t find that page/i }).first().isVisible().catch(() => false);
      if (nf) continue;

      await expectServicePageLoaded(page);
      return;
    }

    throw new Error(`Could not find a routable service page. Last tried ${lastUrl} status ${lastStatus}`);
  });

  test("Messages route is gated but does not 500 for anonymous visitor", async ({ page }) => {
    const resp = await page.goto("/messages", { waitUntil: "domcontentloaded" });

    expect(resp, "No navigation response from /messages").toBeTruthy();
    expect(resp!.status(), "Unexpected status").toBeLessThan(500);

    const url = page.url();
    const html = await page.content();

    const redirectedToSignIn = /\/signin(\?|$)/.test(url);
    const hasSignInCopy = /sign in|log in|login|account required/i.test(html);

    expect(redirectedToSignIn || hasSignInCopy).toBe(true);
    await expect(page.locator("text=Application error")).toHaveCount(0);
  });

  test("Google auth provider is wired and sign-in endpoint is healthy", async ({ page }) => {
    test.skip(!hasGoogleEnv, "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set; skipping Google auth smoke test.");

    const providersRes = await page.request.get("/api/auth/providers", { timeout: 15_000 });
    expect(providersRes.ok()).toBe(true);

    const providersJson = (await providersRes.json().catch(() => null)) as any;
    expect(providersJson && typeof providersJson === "object").toBeTruthy();
    expect(providersJson && providersJson["google"]).toBeTruthy();

    const csrfRes = await page.request.get("/api/auth/csrf", { timeout: 15_000 });
    expect(csrfRes.ok()).toBe(true);

    const csrfJson = (await csrfRes.json().catch(() => null)) as any;
    const csrfTokenRaw = (csrfJson?.csrfToken as unknown) ?? (csrfJson?.csrf?.token as unknown);

    if (typeof csrfTokenRaw !== "string" || !csrfTokenRaw) {
      throw new Error("Missing csrfToken from GET /api/auth/csrf");
    }

    const signInPostRes = await page.request.post("/api/auth/signin/google", {
      timeout: 15_000,
      maxRedirects: 0,
      form: { csrfToken: csrfTokenRaw, callbackUrl: "/dashboard" },
    });

    expect(signInPostRes.status()).toBeGreaterThanOrEqual(300);
    expect(signInPostRes.status()).toBeLessThan(400);

    const location = signInPostRes.headers()["location"] ?? signInPostRes.headers()["Location"] ?? "";
    expect(location).toBeTruthy();
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\//);

    const resp = await page.goto("/signin", { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(500);

    await expect(page.getByRole("link", { name: /continue with google/i })).toBeVisible();
    await expect(page.locator("text=Application error")).toHaveCount(0);
  });
});
