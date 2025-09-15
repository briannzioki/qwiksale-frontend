import { test, expect } from "@playwright/test";

test("service happy flow: search → open → reveal", async ({ page }) => {
  await page.goto("/search?type=service&q=cleaning");
  await page.getByText(/results/i).first().waitFor();

  const first = page.locator("a[href^='/service/']").first();
  await first.click();

  // Gallery open + escape
  await page.getByRole("button", { name: /open image in fullscreen/i }).click();
  await page.keyboard.press("Escape");

  // Show contact (if present)
  const btn = page.getByRole("button", { name: /reveal whatsapp|show contact/i });
  if (await btn.count()) await btn.first().click();

  await expect(page).toHaveURL(/\/service\//);
});
