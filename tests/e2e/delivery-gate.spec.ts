import { test, expect } from "@playwright/test";

test("guest is redirected from /delivery to /signin", async ({ page }) => {
  const res = await page.goto("/delivery", { waitUntil: "domcontentloaded" });

  // Some stacks return 307/308 with middleware; status can be null in client-side redirects.
  if (res) {
    expect([200, 307, 308, 302, 301, 303]).toContain(res.status());
  }

  await expect(page).toHaveURL(/\/signin(\?|$)/i, { timeout: 15_000 });

  const u = new URL(page.url());
  // Best-effort: many flows include callbackUrl=/delivery
  const cb = u.searchParams.get("callbackUrl") ?? u.searchParams.get("callback") ?? "";
  if (cb) {
    expect(cb).toContain("/delivery");
  }
});
