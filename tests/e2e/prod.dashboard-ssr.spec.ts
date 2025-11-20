// tests/e2e/prod.dashboard-ssr.spec.ts
import { test, expect } from "@playwright/test";
import { waitForServerReady } from "./utils/server";

test.describe("Prod: /dashboard SSR for logged-in user", () => {
  test("dashboard renders without 500 and shows a dashboard heading", async ({
    page,
    request,
  }) => {
    const me = await request.get("/api/me", { failOnStatusCode: false });

    test.skip(
      me.status() !== 200,
      "Requires logged-in storage; set E2E_USER_* or E2E_ADMIN_* and rerun.",
    );

    await waitForServerReady(page);

    const resp = await page.goto("/dashboard", {
      waitUntil: "domcontentloaded",
    });

    expect(resp?.ok(), "GET /dashboard should be OK for logged-in user").toBe(
      true,
    );

    const html = await page.content();

    // Basic SSR invariants: HTML & BODY present and no error overlay.
    expect(html).toMatch(/<html[^>]*>/i);
    expect(html).toMatch(/<body[^>]*>/i);
    expect(html).not.toMatch(
      /__next_error__|Application error|500 Internal|An error occurred in the Server Components render/i,
    );

    await expect(
      page.getByRole("heading", { name: /dashboard/i }).first(),
    ).toBeVisible();
  });
});
