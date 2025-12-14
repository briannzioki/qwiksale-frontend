// tests/e2e/prod.dashboard-ssr.spec.ts
import { test, expect } from "@playwright/test";
import path from "node:path";
import { waitForServerReady } from "./utils/server";

// Force this spec to run with the logged-in user snapshot,
// regardless of the global default storageState.
const AUTH_USER_STATE = path.resolve(
  process.cwd(),
  "tests/e2e/.auth/user.json",
);

test.use({
  storageState: AUTH_USER_STATE,
});

test.describe("Prod: /dashboard SSR for logged-in user", () => {
  test("renders dashboard SSR and hydrated UI without 500s", async ({
    page,
    request,
  }) => {
    // Make sure the server is actually up before we do any checks.
    await waitForServerReady(page);

    // Sanity check: this spec *requires* a valid logged-in user state.
    let meStatus = 0;
    try {
      const me = await request.get("/api/me", { failOnStatusCode: false });
      meStatus = me.status();
    } catch {
      // Network / API errors should just cause this prod-only test to be skipped.
      meStatus = 0;
    }

    test.skip(
      meStatus !== 200,
      "Requires valid logged-in user snapshot in tests/e2e/.auth/user.json. Re-generate auth state and rerun.",
    );

    const response = await page.goto("/dashboard", {
      // Stricter wait so we know hydration has had a chance to run.
      waitUntil: "networkidle",
    });

    expect(
      response?.ok(),
      "GET /dashboard should be OK for logged-in user",
    ).toBe(true);

    // Raw SSR HTML from the initial response (pre-DOM manipulation).
    const ssrHtml = (await response?.text()) ?? "";

    // Basic SSR invariants: HTML & BODY tags present, no obvious error overlays.
    expect(ssrHtml).toMatch(/<html[^>]*>/i);
    expect(ssrHtml).toMatch(/<body[^>]*>/i);
    expect(ssrHtml).not.toMatch(
      /__next_error__|Application error|500 Internal|An error occurred in the Server Components render/i,
    );

    // SSR markup should already contain the key dashboard regions.
    // "Dashboard summary" is a stable aria-label; for the others we only assert
    // that their content keywords are present to tolerate copy tweaks.
    expect(ssrHtml).toMatch(/aria-label="Dashboard summary"/);
    expect(ssrHtml).toMatch(/messages/i);
    expect(ssrHtml).toMatch(/activity/i);

    // Also grab the hydrated DOM HTML for debugging / extra safety.
    const domHtml = await page.content();
    expect(domHtml).toMatch(/aria-label="Dashboard summary"/);

    // After hydration those regions should be visible and accessible.

    // Heading: "Dashboard" visible somewhere near the top.
    await expect(
      page.getByRole("heading", { name: /dashboard/i }).first(),
    ).toBeVisible();

    // There are two regions with aria-label="Dashboard summary":
    // 1) The outer summary card
    // 2) The inner grid with data-e2e="dashboard-summary"
    // Playwright strict mode hates ambiguous locators, so explicitly pick one.
    const summaryRegions = page.getByRole("region", {
      name: /dashboard summary/i,
    });

    // At least one summary region must be visible.
    await expect(summaryRegions.first()).toBeVisible();

    // And specifically the inner grid identified by data-e2e should also be visible.
    const summaryGrid = page.locator('[data-e2e="dashboard-summary"]');
    await expect(summaryGrid).toBeVisible();

    // Messages region: there is an outer card and an inner grid, both with
    // "Messages" in their accessible name. Pick the first and just require it
    // to be visible to avoid strict-mode ambiguity.
    const messagesRegions = page.getByRole("region", { name: /messages/i });
    await expect(messagesRegions.first()).toBeVisible();

    // Same for the activity section: name can be "Activity charts",
    // "Activity overview", etc., and we might have nested regions.
    const activityRegions = page.getByRole("region", { name: /activity/i });
    await expect(activityRegions.first()).toBeVisible();

    // If you ever need to debug auth state, temporarily uncomment:
    // const state = await page.context().storageState();
    // console.log("Cookies in this context:", state.cookies);
  });
});
