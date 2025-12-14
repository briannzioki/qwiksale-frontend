// tests/e2e/prod.no-auto-logout.spec.ts
import { test, expect, type APIRequestContext } from "@playwright/test";
import { waitForServerReady, gotoHome } from "./utils/server";

async function getMeStatus(request: APIRequestContext): Promise<number> {
  const res = await request.get("/api/me", { failOnStatusCode: false });
  return res.status();
}

test.describe("Prod: no automatic logout on normal navigation", () => {
  test("session survives moving between home, dashboard, and messages (including Open inbox CTA when present)", async ({
    page,
    request,
  }) => {
    const initialStatus = await getMeStatus(request);

    test.skip(
      initialStatus !== 200,
      "Requires logged-in storage; set E2E_USER_* or E2E_ADMIN_* and rerun.",
    );

    await waitForServerReady(page);

    // 1) Home
    await gotoHome(page);
    await expect(
      page.getByRole("link", { name: /^sign in$/i }),
    ).toHaveCount(0);
    expect(await getMeStatus(request)).toBe(200);

    // 2) Dashboard (user may land on /dashboard or be redirected to /admin)
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(await getMeStatus(request)).toBe(200);

    const url = page.url();

    if (/\/dashboard(\/|$)/.test(url)) {
      // Normal user dashboard – prefer going to messages via "Open inbox"
      const messagesRegion = page.getByRole("region", {
        name: /messages snapshot/i,
      });

      const openInboxLink = messagesRegion.getByRole("link", {
        name: /open inbox/i,
      });

      const count = await openInboxLink.count();
      if (count > 0) {
        await Promise.all([
          page.waitForURL(/\/messages(\/|$)/),
          openInboxLink.first().click(),
        ]);
      } else {
        // Fallback if the link is unexpectedly missing.
        await page.goto("/messages", { waitUntil: "domcontentloaded" });
      }
    } else {
      // Admin or some other layout – go directly to /messages.
      await page.goto("/messages", { waitUntil: "domcontentloaded" });
    }

    // 3) Messages – whatever route we took, we must still be logged in.
    expect(await getMeStatus(request)).toBe(200);

    // Messages page should not show the "Sign in" CTA.
    await expect(
      page.getByRole("link", { name: /^sign in$/i }),
    ).toHaveCount(0);

    // And the inbox UI should be present.
    await expect(page.getByText(/messages/i)).toBeVisible();
    await expect(page.getByText(/inbox/i)).toBeVisible();
  });
});
