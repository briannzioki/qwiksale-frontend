import { test, expect } from "@playwright/test";
import { gotoHome } from "./utils/server";

test("service happy flow: search → open → reveal", async ({ page }) => {
  await gotoHome(page);

  // Ensure at least one service card is rendered
  await page.waitForSelector('a[href^="/service/"]');

  // Click a service and wait for route change
  await Promise.all([
    page.waitForURL(/\/service\/[0-9a-f-]{36}$/),
    page.locator('a[href^="/service/"]').first().click(),
  ]);

  // Wait for the gallery overlay to mount and become visible
  const overlay = page.locator('[data-gallery-overlay="true"]').first();
  await overlay.waitFor({ state: "visible" });

  // Prefer the stable overlay; fall back to the role-based button if needed
  try {
    await overlay.click();
  } catch {
    const openBtn = page.getByRole("button", { name: /open image in fullscreen/i }).first();
    await openBtn.waitFor({ state: "visible" });
    await openBtn.click();
  }

  // Close fullscreen
  await page.keyboard.press("Escape");

  // Show contact (if present)
  const reveal = page
    .getByRole("link", { name: /reveal contact/i })
    .or(page.getByRole("button", { name: /show contact/i }));
  if ((await reveal.count()) > 0) {
    await reveal.first().click();
  }
});
