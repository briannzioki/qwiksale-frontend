// tests/e2e/store-flow.spec.ts
import { test, expect, type Page } from "@playwright/test";
import { waitForServerReady } from "./utils/server";

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

test.describe("Store flows", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await waitForServerReady(page);
    } finally {
      await page.close();
    }
  });

  test("Store page is reachable from a product detail and renders without 500", async ({
    page,
  }) => {
    const productId = await getAnyProductId(page);
    test.skip(
      !productId,
      "No product available in home feed or /api/products; seed at least one.",
    );

    const productUrl = `/product/${productId}`;
    const resp = await page.goto(productUrl, {
      waitUntil: "domcontentloaded",
    });

    expect(resp?.ok(), `GET ${productUrl} should be OK`).toBe(true);

    // There should be at least one store link on the page
    const storeLink = page
      .getByRole("link", {
        name: /visit store|view store|more from this seller|seller store/i,
      })
      .first();

    await expect(storeLink).toBeVisible();

    const hostBefore = new URL(page.url()).host;

    // Wait for actual navigation to /store/ instead of reusing the existing load state
    await Promise.all([
      page.waitForURL(/\/store\//),
      storeLink.click(),
    ]);

    const storeUrl = new URL(page.url());
    expect(storeUrl.host).toBe(hostBefore);
    expect(storeUrl.pathname).toMatch(/\/store\//);

    await expect(
      page
        .getByRole("heading", { name: /store|seller|listings by/i })
        .first(),
    ).toBeVisible();

    await expect(page.locator("text=Application error")).toHaveCount(0);
  });
});
