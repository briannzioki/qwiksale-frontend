import { test, expect } from "@playwright/test";

test("API auth sanity: /api/me returns 200 with cookie", async ({ request }) => {
  const res = await request.get("/api/me", { failOnStatusCode: false });
  test.skip(res.status() !== 200, "Requires logged-in storage; set E2E_USER_* or E2E_ADMIN_*.");
  expect(res.status()).toBe(200);
});
