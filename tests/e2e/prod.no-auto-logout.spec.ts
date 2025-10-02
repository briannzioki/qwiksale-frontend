import { test, expect } from "@playwright/test";

test("no auto hard-logout or signout calls", async ({ page }) => {
  const hit: string[] = [];
  page.on("request", req => {
    const u = req.url();
    if (u.includes("/api/dev/hard-logout") || u.includes("/api/auth/signout")) hit.push(u);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  expect(hit, `Unexpected logout calls: ${hit.join(", ")}`).toHaveLength(0);
});
