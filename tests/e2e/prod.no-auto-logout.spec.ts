// tests/e2e/prod.no-auto-logout.spec.ts
import { test, expect } from "@playwright/test";
import { waitForServerReady, gotoHome } from "./utils/server";

async function getMeStatus(
  request: import("@playwright/test").APIRequestContext,
): Promise<number> {
  const res = await request.get("/api/me", { failOnStatusCode: false });
  return res.status();
}

test.describe("Prod: no automatic logout on normal navigation", () => {
  test("session survives moving between home, dashboard, and messages", async ({
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

    // 2) Dashboard
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(await getMeStatus(request)).toBe(200);

    // 3) Messages (may redirect / gate, but must not log us out)
    await page
      .goto("/messages", { waitUntil: "domcontentloaded" })
      .catch(() => {});

    expect(await getMeStatus(request)).toBe(200);
  });
});
