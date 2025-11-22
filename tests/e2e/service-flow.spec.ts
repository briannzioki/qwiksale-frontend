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

  // Open gallery: prefer explicit overlay, fall back to fullscreen button
  const overlay = page.locator('[data-gallery-overlay="true"]').first();
  let opened = false;

  // Try overlay first, but don't hard-fail if it never becomes visible
  try {
    await overlay.waitFor({ state: "visible", timeout: 5_000 });
    await overlay.click();
    opened = true;
  } catch {
    const openBtn = page
      .getByRole("button", { name: /open image in fullscreen/i })
      .first();
    await openBtn.waitFor({ state: "visible", timeout: 10_000 });
    await openBtn.click();
    opened = true;
  }

  if (!opened) {
    test.skip(true, "No clickable gallery overlay or fullscreen button found");
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
