// tests/e2e/dashboard-guardrail.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Dashboard auth guardrail (anonymous user)", () => {
  // Force logged-out state for this spec
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Anonymous visitor is asked to sign in instead of hitting a 500", async ({
    page,
  }) => {
    const resp = await page.goto("/dashboard", {
      waitUntil: "domcontentloaded",
    });
    expect(resp, "No navigation response from /dashboard").toBeTruthy();

    const status = resp!.status();
    expect(status, `Unexpected status ${status}`).toBeLessThan(500);

    const url = page.url();
    const html = await page.content();

    const redirectedToSignIn = /\/signin(\?|$)/.test(url);
    const hasSignInLink =
      (await page.getByRole("link", { name: /sign in/i }).count()) > 0;
    const hasAuthCopy = /sign in|log in|login|account required/i.test(html);

    expect(
      redirectedToSignIn || hasSignInLink || hasAuthCopy,
      "Dashboard should gate anonymous users with a sign-in flow",
    ).toBeTruthy();

    // No Next.js dev/prod error markers
    expect(html).not.toMatch(
      /__next_error__|Application error|500 Internal|An error occurred in the Server Components render/i,
    );
  });
});
