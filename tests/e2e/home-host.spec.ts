// tests/e2e/home-host.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Home link host & navigation", () => {
  test("Home link href stays on same host", async ({ page, baseURL }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const current = new URL(page.url(), baseURL ?? page.url());
    const homeLink = page
      .getByRole("link", { name: /home|qwiksale|logo/i })
      .first();

    const href = (await homeLink.getAttribute("href")) ?? "/";
    const resolved = new URL(href, baseURL ?? page.url());

    expect(resolved.host).toBe(current.host);
  });

  test("Clicking Home from a deeper route returns to / on the same host", async ({
    page,
  }) => {
    // Try a simple marketing route first; fall back to /dashboard if needed.
    await page
      .goto("/help", { waitUntil: "domcontentloaded" })
      .catch(async () => {
        await page
          .goto("/dashboard", { waitUntil: "domcontentloaded" })
          .catch(() => {});
      });

    const startHost = new URL(page.url()).host;

    const homeLink = page
      .getByRole("link", { name: /home|qwiksale|logo/i })
      .first();
    await homeLink.click();
    await page.waitForLoadState("domcontentloaded");

    const url = new URL(page.url());
    expect(url.host).toBe(startHost);
    expect(url.pathname).toBe("/");
  });
});
