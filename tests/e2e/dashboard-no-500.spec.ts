// tests/e2e/dashboard-no-500.spec.ts
import { test, expect } from "@playwright/test";

test("Dashboard loads without 5xx, no Next error markers, and shows core regions", async ({
  page,
  request,
}) => {
  const me = await request.get("/api/me", { failOnStatusCode: false });

  let payload: any = null;
  try {
    payload = await me.json();
  } catch {
    payload = null;
  }

  const isLoggedIn = me.status() === 200 && !!payload && !!payload.id;

  // If we don't have a real session (no truthy `id`), this test is meaningless.
  // It should be run only when E2E_USER_* / E2E_ADMIN_* storage is in play.
  test.skip(
    !isLoggedIn,
    "Requires logged-in storage; set E2E_USER_* or E2E_ADMIN_* and rerun.",
  );

  const resp = await page.goto("/dashboard", {
    waitUntil: "domcontentloaded",
  });

  expect(resp, "No navigation response").toBeTruthy();
  const status = resp!.status();
  expect(status, `Unexpected status ${status}`).toBeLessThan(500);

  const html = await page.content();
  expect(html).not.toMatch(/__next_error__/i);
  expect(html).not.toMatch(
    /An error occurred in the Server Components render/i,
  );

  // New SSR sections should render cleanly even when data is effectively "empty".
  const summaryRegion = page.getByRole("region", {
    name: /dashboard summary/i,
  });
  await expect(summaryRegion).toBeVisible();

  const messagesRegion = page.getByRole("region", {
    name: /messages snapshot/i,
  });
  await expect(messagesRegion).toBeVisible();

  const chartsRegion = page.getByRole("region", {
    name: /activity charts/i,
  });
  await expect(chartsRegion).toBeVisible();
});
