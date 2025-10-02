import { test, expect } from "@playwright/test";

test("Dashboard loads without 5xx and no Next error markers", async ({ page }) => {
  const resp = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(resp, "No navigation response").toBeTruthy();
  const status = resp!.status();
  expect(status, `Unexpected status ${status}`).toBeLessThan(500);

  const html = await page.content();
  expect(html).not.toMatch(/__next_error__/i);
  expect(html).not.toMatch(/An error occurred in the Server Components render/i);
});
