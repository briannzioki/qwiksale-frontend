import { test, expect } from "@playwright/test";

test("Dashboard SSR path: no 5xx and no error markers", async ({ page }) => {
  const resp = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(resp).toBeTruthy();
  expect(resp!.status()).toBeLessThan(500);
  const html = await page.content();
  expect(html).not.toMatch(/__next_error__/i);
});
