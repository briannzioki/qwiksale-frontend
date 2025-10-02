import { test, expect } from "@playwright/test";

test("Dashboard shows soft error UI instead of 500", async ({ page }) => {
  const resp = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(resp).toBeTruthy();
  expect(resp!.status()).toBeLessThan(500);
  await expect(page.getByText(/we hit a dashboard error/i)).toHaveCount(1);
});
