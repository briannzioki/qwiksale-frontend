import { test, expect } from "@playwright/test";

test("API auth sanity: /api/me returns 200 with cookie", async ({ request }) => {
  const res = await request.get("/api/me", { failOnStatusCode: false });
  expect(res.status(), await res.text()).toBe(200);
});
