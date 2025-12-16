import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/user.json" });

function jsonNoStore(body: any) {
  return {
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

async function mockMeProfile(
  page: Page,
  user: Record<string, any>,
  opts?: { onHit?: () => void },
) {
  await page.route("**/api/me/profile", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    opts?.onHit?.();
    return route.fulfill(jsonNoStore({ user }));
  });
}

test.describe("Account · email verification", () => {
  test("Profile shows Verify now CTA when email is NOT verified (seller verified is separate)", async ({
    page,
  }) => {
    // Guardrail: profile page should never call /api/me
    let meHitCount = 0;
    await page.route("**/api/me", async (route) => {
      meHitCount += 1;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({ error: "Do not call /api/me here" }),
      });
    });

    await mockMeProfile(page, {
      id: "u_test",
      email: "user@example.com",
      emailVerified: null, // NOT verified
      username: "demo",
      whatsapp: "254712345678",
      city: null,
      country: null,
      postalCode: null,
      address: null,
      image: null,
      storeLocationUrl: null,

      // Seller/store verification is separate from email verification.
      verified: true,
      profileComplete: false,
      profileCompletion: { percent: 67, missing: ["emailVerified"] },
    });

    await page.goto("/account/profile");

    // Email verify CTA should show (because emailVerified is null)
    const cta = page.getByTestId("profile-verify-email");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /\/account\/verify-email\?/);
    await expect(cta).toHaveAttribute("href", /next=%2Faccount%2Fprofile/);
    await expect(cta).toHaveAttribute("href", /auto=1/);

    expect(meHitCount).toBe(0);
  });

  test("Profile shows Email verified pill and hides Verify now CTA when email IS verified", async ({
    page,
  }) => {
    await mockMeProfile(page, {
      id: "u_test",
      email: "user@example.com",
      emailVerified: new Date().toISOString(), // verified
      username: "demo",
      whatsapp: "254712345678",
      city: null,
      country: null,
      postalCode: null,
      address: null,
      image: null,
      storeLocationUrl: null,
      verified: false,
      profileComplete: true,
      profileCompletion: { percent: 100, missing: [] },
    });

    await page.goto("/account/profile");

    await expect(page.getByText("Email verified", { exact: true })).toBeVisible();
    await expect(page.getByTestId("profile-verify-email")).toHaveCount(0);
  });

  test("Verify email page: auto-send request, confirm code, success banner", async ({
    page,
  }) => {
    // VerifyEmailClient reads /api/me/profile, so stub it.
    let meProfileCalls = 0;
    await page.route("**/api/me/profile", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      meProfileCalls += 1;

      // 1st load: unverified
      // After confirm, client re-fetches: verified
      const emailVerified = meProfileCalls >= 2 ? new Date().toISOString() : null;

      return route.fulfill(
        jsonNoStore({
          user: {
            id: "u_test",
            email: "user@example.com",
            emailVerified,
          },
        }),
      );
    });

    let requestCount = 0;

    await page.route("**/api/account/verify-email/request", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requestCount += 1;
      return route.fulfill(jsonNoStore({ ok: true, sent: true }));
    });

    await page.route("**/api/account/verify-email/confirm", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill(jsonNoStore({ ok: true, verified: true, emailVerified: true }));
    });

    await page.goto("/account/verify-email?next=%2Faccount%2Fprofile&auto=1");

    // Auto-send should have fired once.
    await expect(page.getByTestId("verify-email-request")).toBeVisible();
    await expect.poll(() => requestCount).toBe(1);

    // Confirm code
    await page.getByTestId("verify-email-code").fill("123456");
    await page.getByTestId("verify-email-confirm").click();

    await expect(page.getByTestId("verify-email-success")).toBeVisible();
  });

  test("Complete-profile shows Verify email CTA (and must use /api/me/profile, not /api/me)", async ({
    page,
  }) => {
    let meHitCount = 0;
    await page.route("**/api/me", async (route) => {
      meHitCount += 1;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({ error: "Do not call /api/me here" }),
      });
    });

    let meProfileHitCount = 0;
    await mockMeProfile(
      page,
      {
        id: "u_test",
        email: "user@example.com",
        emailVerified: null,
        username: null,
        phone: null,
        whatsapp: null,
        address: null,
        postalCode: null,
        city: null,
        country: null,
        image: null,
        verified: false,
        profileComplete: false,
        profileCompletion: {
          percent: 0,
          missing: ["username", "whatsapp", "emailVerified"],
        },
      },
      { onHit: () => (meProfileHitCount += 1) },
    );

    await page.goto("/account/complete-profile?next=%2Fdashboard");

    const verifyBtn = page.getByTestId("complete-profile-verify-email");
    await expect(verifyBtn).toBeVisible();
    await expect(verifyBtn).toHaveAttribute("href", /\/account\/verify-email\?/);
    await expect(verifyBtn).toHaveAttribute("href", /next=%2Fdashboard/);
    await expect(verifyBtn).toHaveAttribute("href", /auto=1/);

    expect(meHitCount).toBe(0);
    expect(meProfileHitCount).toBeGreaterThan(0);
  });
});
