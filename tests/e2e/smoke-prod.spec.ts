// tests/e2e/smoke-prod.spec.ts
import { test, expect, type Page } from "@playwright/test";
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

// Presence of these envs is our signal that Google should be wired in E2E.
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

  test("Home page renders hero + search without error overlay", async ({
    page,
  }) => {
    await gotoHome(page);

    await expect(
      page
        .getByRole("heading", { name: /qwiksale|sell faster|buy smarter/i })
        .first(),
    ).toBeVisible();

    const searchBox = page
      .getByRole("textbox", {
        name: /search|what are you looking for/i,
      })
      .first();
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
      const resp = await page.goto(path, {
        waitUntil: "domcontentloaded",
      });
      expect(resp?.status(), `GET ${path} status`).toBeLessThan(500);

      await expect(
        page.getByRole("heading", { name: heading }).first(),
      ).toBeVisible();

      await expect(page.locator("text=Application error")).toHaveCount(0);
    }
  });

  test("Product detail page works for at least one product and links to store", async ({
    page,
  }) => {
    const productId = await getAnyProductId(page);
    test.skip(
      !productId,
      "No product available in home feed or /api/products; seed at least one.",
    );

    const url = `/product/${productId}`;
    const resp = await page.goto(url, { waitUntil: "domcontentloaded" });

    expect(resp?.ok(), `GET ${url} should be OK`).toBe(true);

    // New layout: title is the product name, not literally "Product/Item/Listing"
    await expect(page.locator("h1").first()).toBeVisible();

    await expect(page.locator("text=Application error")).toHaveCount(0);

    // Message seller button should be visible even for guests (it can open auth).
    await expect(
      page
        .getByRole("button", {
          name: /message seller|contact seller|chat with seller/i,
        })
        .first(),
    ).toBeVisible();

    const storeLink = page
      .getByRole("link", {
        name: /visit store|view store|more from this seller|seller store/i,
      })
      .first();

    if ((await storeLink.count()) > 0) {
      const hostBefore = new URL(page.url()).host;

      await Promise.all([
        page.waitForURL(/\/store\//),
        storeLink.click(),
      ]);

      const storeUrl = new URL(page.url());
      expect(storeUrl.host).toBe(hostBefore);

      await expect(
        page
          .getByRole("heading", { name: /store|seller|listings by/i })
          .first(),
      ).toBeVisible();

      await expect(page.locator("text=Application error")).toHaveCount(0);
    }
  });

  test("Service detail page works for at least one service", async ({ page }) => {
    const serviceId = await getAnyServiceId(page);
    test.skip(
      !serviceId,
      "No service available in home feed or /api/services; seed at least one.",
    );

    const url = `/service/${serviceId}`;
    const resp = await page.goto(url, { waitUntil: "domcontentloaded" });

    expect(resp?.ok(), `GET ${url} should be OK`).toBe(true);

    await expect(
      page.getByRole("heading", { name: /service|provider|listing/i }).first(),
    ).toBeVisible();

    await expect(page.locator("text=Application error")).toHaveCount(0);

    await expect(
      page
        .getByRole("button", {
          name: /message provider|contact provider|chat with provider/i,
        })
        .first(),
    ).toBeVisible();
  });

  test("Messages route is gated but does not 500 for anonymous visitor", async ({
    page,
  }) => {
    const resp = await page.goto("/messages", {
      waitUntil: "domcontentloaded",
    });

    expect(resp, "No navigation response from /messages").toBeTruthy();
    const status = resp!.status();
    expect(status, `Unexpected status ${status}`).toBeLessThan(500);

    const url = page.url();
    const html = await page.content();

    const redirectedToSignIn = /\/signin(\?|$)/.test(url);
    const hasSignInCopy = /sign in|log in|login|account required/i.test(html);

    expect(
      redirectedToSignIn || hasSignInCopy,
      "Messages route should gate anonymous users with a sign-in flow",
    ).toBe(true);

    await expect(page.locator("text=Application error")).toHaveCount(0);
  });

  test("Google auth provider is wired and sign-in endpoint is healthy", async ({
    page,
  }) => {
    test.skip(
      !hasGoogleEnv,
      "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set; skipping Google auth smoke test.",
    );

    // 1) /api/auth/providers includes google
    const providersRes = await page.request.get("/api/auth/providers", {
      timeout: 15_000,
    });
    expect(
      providersRes.ok(),
      "GET /api/auth/providers should succeed",
    ).toBe(true);

    const providersJson = (await providersRes.json().catch(() => null)) as any;
    expect(
      providersJson && typeof providersJson === "object",
      "Providers payload should be an object",
    ).toBeTruthy();

    expect(
      providersJson && providersJson["google"],
      "Expected 'google' provider in /api/auth/providers when GOOGLE_CLIENT_ID/SECRET are set.",
    ).toBeTruthy();

    // 2) sign-in endpoint itself should not throw a Configuration error / 500
    const signInRes = await page.request.get(
      "/api/auth/signin/google?callbackUrl=%2Fdashboard",
      { timeout: 15_000, maxRedirects: 0 },
    );
    const status = signInRes.status();
    expect(
      status,
      `GET /api/auth/signin/google status should be < 500 (got ${status})`,
    ).toBeLessThan(500);

    const body = await signInRes.text();
    expect(body).not.toMatch(/Configuration/i);

    // 3) The /signin page actually shows the Google button when provider exists
    const resp = await page.goto("/signin", {
      waitUntil: "domcontentloaded",
    });
    expect(resp?.status(), "GET /signin status").toBeLessThan(500);

    await expect(
      page.getByRole("link", { name: /continue with google/i }),
    ).toBeVisible();

    const html = await page.content();
    expect(html).not.toMatch(/Auth is temporarily misconfigured/i);
    await expect(page.locator("text=Application error")).toHaveCount(0);
  });
});
