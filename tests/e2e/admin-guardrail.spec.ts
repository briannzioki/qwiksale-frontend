import { test, expect } from "@playwright/test";

// Guardrail: page shows _soft_ error UI if something fails server-side.
// In logged-out mode, we skip because middleware shows the sign-in gate instead.
test("Dashboard shows soft error UI instead of 500", async ({ page, request }) => {
  const me = await request.get("/api/me", { failOnStatusCode: false });
  test.skip(me.status() !== 200, "Requires logged-in storage; set E2E_USER_* and rerun.");

  const resp = await page.goto("/dashboard?e2e_force_error=1", { waitUntil: "domcontentloaded" });
  expect(resp).toBeTruthy();
  expect(resp!.status()).toBeLessThan(500);

  await expect(page.getByText(/we hit a dashboard error/i)).toHaveCount(1);
});
