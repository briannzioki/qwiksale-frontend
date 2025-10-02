// tests/e2e/home-host.spec.ts
import { test, expect } from "@playwright/test";

test("Home link keeps same host", async ({ page, baseURL }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const host = new URL(page.url()).host;

  const home = page.getByRole("link", { name: /home|qwiksale|logo/i }).first();
  const href = await home.getAttribute("href");
  const resolved = new URL(href ?? "/", baseURL ?? page.url());
  expect(resolved.host).toBe(host);
});
