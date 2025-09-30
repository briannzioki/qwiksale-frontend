import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Ping health + a real data endpoint so Next/Prisma are fully hot. */
export async function waitForServerReady(page: Page, timeout = 45_000) {
  await expect
    .poll(
      async () => {
        try {
          const health = await page.request.get("/api/health", { timeout: 10_000 });
          if (!health.ok()) return false;
          const feed = await page.request.get("/api/home-feed?t=all&pageSize=1", { timeout: 10_000 });
          return feed.ok();
        } catch {
          return false;
        }
      },
      { timeout }
    )
    .toBeTruthy();
}

export async function gotoHome(page: Page) {
  await waitForServerReady(page);
  try {
    await page.goto("/", { timeout: 30_000, waitUntil: "domcontentloaded" });
  } catch {
    // brief backoff & retry — avoids occasional cold-start hiccup
    await page.waitForTimeout(500);
    await page.goto("/", { timeout: 30_000, waitUntil: "domcontentloaded" });
  }
}
