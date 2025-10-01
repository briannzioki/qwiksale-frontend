import { test, expect } from "@playwright/test";

test('Home link keeps same host', async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const host = new URL(page.url()).host;
  // Click your logo/home anchor; adjust selector if different
  await page.getByRole("link", { name: /home|qwiksale|logo/i }).first().click();
  await page.waitForLoadState("domcontentloaded");
  expect(new URL(page.url()).host).toBe(host);
});
