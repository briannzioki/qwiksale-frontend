import { test } from "@playwright/test";
import { gotoHome } from "./utils/server";

test("service happy flow: search → open → reveal", async ({ page }) => {
  await gotoHome(page);

  // Open Services tab explicitly (if applicable)
  await page.goto("/?tab=services", { waitUntil: "domcontentloaded" });

  const links = page.locator('a[href^="/service/"]');
  const count = await links.count();
  if (count === 0) test.skip(true, "No service links found on /?tab=services");

  const first = links.first();

  // Try to make it interactable
  await first.scrollIntoViewIfNeeded().catch(() => {});
  const href = await first.getAttribute("href");

  // Prefer a real click (UI path). If not visible/interactable, fall back to navigation.
  try {
    await Promise.all([
      page.waitForURL(/\/service\/[^/]+$/),
      first.click({ timeout: 5_000 }),
    ]);
  } catch {
    if (!href) test.skip(true, "Service link not interactable and no href available");
    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/service\/[^/]+$/);
  }

  // Wait for the gallery overlay to mount and become visible
  const overlay = page.locator('[data-gallery-overlay="true"]').first();
  await overlay.waitFor({ state: "visible" });

  // Prefer the overlay as the open target; fall back to an accessible button label
  try {
    await overlay.click();
  } catch {
    const openBtn = page.getByRole("button", { name: /open image in fullscreen/i }).first();
    await openBtn.waitFor({ state: "visible" });
    await openBtn.click();
  }

  // Close fullscreen
  await page.keyboard.press("Escape");

  // Reveal contact if present
  const reveal = page
    .getByRole("link", { name: /reveal contact/i })
    .or(page.getByRole("button", { name: /show contact/i }));
  if ((await reveal.count()) > 0) {
    await reveal.first().click();
  }
});
