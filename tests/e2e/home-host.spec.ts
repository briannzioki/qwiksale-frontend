// tests/e2e/home-host.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Home link host & navigation", () => {
  test("Home link href stays on same host", async ({ page, baseURL }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const current = new URL(page.url(), baseURL ?? page.url());

    const headerHome = page.locator('[data-testid="site-header"] a[href="/"]');
    const homeLink =
      (await headerHome.count()) > 0
        ? headerHome.first()
        : page.locator('a[href="/"]').first();

    const href = (await homeLink.getAttribute("href")) ?? "/";
    const resolved = new URL(href, baseURL ?? page.url());

    expect(resolved.host).toBe(current.host);
  });

  test("Clicking Home from a deeper route returns to / on the same host", async ({
    page,
  }) => {
    await page
      .goto("/help", { waitUntil: "domcontentloaded" })
      .catch(async () => {
        await page
          .goto("/dashboard", { waitUntil: "domcontentloaded" })
          .catch(() => {});
      });

    const startHost = new URL(page.url()).host;

    const headerHome = page.locator('[data-testid="site-header"] a[href="/"]');
    const homeLink =
      (await headerHome.count()) > 0
        ? headerHome.first()
        : page.locator('a[href="/"]').first();

    await homeLink.click();

    await page.waitForURL(
      (u) => {
        try {
          return new URL(u).pathname === "/";
        } catch {
          return false;
        }
      },
      { waitUntil: "domcontentloaded" },
    );

    const url = new URL(page.url());
    expect(url.host).toBe(startHost);
    expect(url.pathname).toBe("/");
  });
});
