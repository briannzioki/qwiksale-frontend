import { test, expect } from "@playwright/test";

/**
 * NOTE:
 * - Guest tests run with default (empty) storage state.
 * - Authenticated tests assume you have user auth state at:
 *     tests/e2e/.auth/user.json
 *   Adjust storageState paths if your repo uses a different location.
 */

/* -------------------------------------------------------------------------- */
/* /messages                                                                  */
/* -------------------------------------------------------------------------- */

test.describe("/messages – guest", () => {
  test("shows hero and Sign in CTA (no soft-error)", async ({ page }) => {
    await page.goto("/messages");

    await expect(
      page.getByRole("heading", { name: "Messages" })
    ).toBeVisible();

    await expect(
      page.getByText("Please sign in to view your messages.")
    ).toBeVisible();

    const signInLink = page.getByRole("link", { name: "Sign in" });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute(
      "href",
      /\/signin\?callbackUrl=%2Fmessages/
    );

    await expect(page.locator('[data-soft-error="messages"]')).toHaveCount(0);
  });
});

test.describe("/messages – logged-in user", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test("shows hero and Conversations list, no soft-error", async ({ page }) => {
    await page.goto("/messages");

    await expect(
      page.getByRole("heading", { name: "Messages" })
    ).toBeVisible();

    // Conversations header in the main conversations region
    const conversationsRegion = page.getByRole("region", {
      name: "Conversations",
    });
    await expect(
      conversationsRegion.getByRole("heading", { name: "Conversations" })
    ).toBeVisible();

    await expect(page.locator('[data-soft-error="messages"]')).toHaveCount(0);

    // Composer should exist even if there are no messages
    await expect(
      page
        .getByRole("form")
        .filter({ hasText: "Write a message" })
        .or(page.getByPlaceholder("Write a message…"))
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* /onboarding                                                                */
/* -------------------------------------------------------------------------- */

test.describe("/onboarding – guest", () => {
  test("shows finish profile hero and sign-in prompt", async ({ page }) => {
    await page.goto("/onboarding");

    await expect(
      page.getByRole("heading", { name: /Finish your profile/i })
    ).toBeVisible();

    // Username field should be present even for guests
    await expect(page.getByLabel(/Username/i)).toBeVisible();

    // Alert that asks user to sign in
    const signInLink = page
      .getByRole("link", { name: /sign in/i })
      .first();
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute(
      "href",
      /\/signin\?callbackUrl=.*%2Fonboarding\?return=%2Fdashboard/
    );
  });
});

test.describe("/onboarding – logged-in user", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test("shows profile form with username + Save + Skip for now", async ({ page }) => {
    await page.goto("/onboarding");

    await expect(
      page.getByRole("heading", { name: /Finish your profile/i })
    ).toBeVisible();

    await expect(page.getByLabel(/Username/i)).toBeVisible();
    await expect(page.getByLabel(/WhatsApp/i)).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Save/i })
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: /Skip for now/i })
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* /pay                                                                       */
/* -------------------------------------------------------------------------- */

test.describe("/pay – MPesa test page wiring", () => {
  test("shows hero, phone, amount, mode, and primary CTA", async ({ page }) => {
    await page.goto("/pay");

    await expect(
      page.getByRole("heading", { name: "Test M-Pesa STK Push" })
    ).toBeVisible();

    await expect(
      page.getByLabel(/Phone .*2547|2541/i)
    ).toBeVisible();

    await expect(page.getByLabel(/Amount \(KES\)/i)).toBeVisible();

    await expect(page.getByLabel(/Mode/i)).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Send STK Push/i })
    ).toBeVisible();

    const callbackLink = page.getByRole("link", { name: /Callback status/i });
    await expect(callbackLink).toBeVisible();
    await expect(callbackLink).toHaveAttribute("href", "/api/mpesa/callback");
  });
});

/* -------------------------------------------------------------------------- */
/* /post – listing chooser                                                    */
/* -------------------------------------------------------------------------- */

test.describe("/post – chooser page wiring", () => {
  test("shows listing hero and product/service CTAs", async ({ page }) => {
    await page.goto("/post");

    await expect(
      page.getByRole("heading", { name: /Create a listing in minutes/i })
    ).toBeVisible();

    const productCtas = page.getByRole("link", { name: /Post a product/i });
    await expect(productCtas.first()).toBeVisible();
    await expect(productCtas.first()).toHaveAttribute("href", "/sell/product");

    const serviceCtas = page.getByRole("link", { name: /Post a service/i });
    await expect(serviceCtas.first()).toBeVisible();
    await expect(serviceCtas.first()).toHaveAttribute("href", "/sell/service");

    await expect(
      page.getByRole("heading", { name: /Sell a Product/i })
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /Offer a Service/i })
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* /signup                                                                    */
/* -------------------------------------------------------------------------- */

test.describe("/signup – wiring", () => {
  test("shows gradient hero, Google button, email + password fields and sign-in link", async ({
    page,
  }) => {
    await page.goto("/signup");

    await expect(
      page.getByRole("heading", { name: /Create your QwikSale account/i })
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Continue with Google/i })
    ).toBeVisible();

    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/^Password$/i)).toBeVisible();
    await expect(page.getByLabel(/Confirm password/i)).toBeVisible();

    const signInLink = page.getByRole("link", { name: /Sign in/i });
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toHaveAttribute(
      "href",
      /\/signin\?callbackUrl=/
    );
  });
});

/* -------------------------------------------------------------------------- */
/* /sell/product – ProductForm wiring                                         */
/* -------------------------------------------------------------------------- */

test.describe("/sell/product – logged-in user form wiring", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test("shows product form with core fields and uploader status", async ({ page }) => {
    await page.goto("/sell/product");

    await expect(
      page
        .getByRole("heading", { name: /Post a Product/i })
        .or(page.getByRole("heading", { name: /Edit Product/i }))
    ).toBeVisible();

    await expect(page.getByLabel(/^Title$/i)).toBeVisible();
    await expect(page.getByLabel(/Price \(KES\)/i)).toBeVisible();
    await expect(page.getByLabel(/^Condition$/i)).toBeVisible();
    await expect(page.getByLabel(/^Category$/i)).toBeVisible();
    await expect(page.getByLabel(/^Subcategory$/i)).toBeVisible();
    await expect(page.getByLabel(/Brand \(optional\)/i)).toBeVisible();
    await expect(page.getByLabel(/^Location$/i)).toBeVisible();
    await expect(page.getByLabel(/Phone \(WhatsApp, optional\)/i)).toBeVisible();
    await expect(page.getByLabel(/^Description$/i)).toBeVisible();

    // Gallery uploader wiring: helper text about pending files
    await expect(
      page.getByText(/No new files selected/i)
    ).toBeVisible();

    // Submit button with data-testid from ProductForm
    await expect(
      page.getByTestId("product-form-submit")
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* /sell/service – ServiceForm wiring                                         */
/* -------------------------------------------------------------------------- */

test.describe("/sell/service – logged-in user form wiring", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test("shows service form with core fields and uploader status", async ({ page }) => {
    await page.goto("/sell/service");

    await expect(
      page
        .getByRole("heading", { name: /Post a Service/i })
        .or(page.getByRole("heading", { name: /Edit Service/i }))
    ).toBeVisible();

    await expect(page.getByLabel(/Service name/i)).toBeVisible();
    await expect(page.getByLabel(/Price \(KES\)/i)).toBeVisible();
    await expect(page.getByText(/Fixed.*\/hour.*\/day/)).toBeVisible();
    await expect(page.getByLabel(/^Category$/i)).toBeVisible();
    await expect(page.getByLabel(/Subcategory \(optional\)/i)).toBeVisible();
    await expect(page.getByLabel(/Service area \(optional\)/i)).toBeVisible();
    await expect(page.getByLabel(/Availability \(optional\)/i)).toBeVisible();
    await expect(page.getByLabel(/Base location/i)).toBeVisible();
    await expect(page.getByLabel(/Seller phone \(optional\)/i)).toBeVisible();
    await expect(page.getByLabel(/^Description$/i)).toBeVisible();

    await expect(
      page.getByText(/No new files selected/i)
    ).toBeVisible();

    await expect(
      page
        .getByRole("button", { name: /Post service/i })
        .or(page.getByRole("button", { name: /Save changes/i }))
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* /search – SuggestInput wiring sanity                                      */
/* -------------------------------------------------------------------------- */

test.describe("/search – SuggestInput wiring", () => {
  test("has a combobox and shows a listbox after typing", async ({ page }) => {
    await page.goto("/search");

    // First SuggestInput on the page
    const combo = page.locator('input[role="combobox"]').first();
    await expect(combo).toBeVisible();

    await combo.fill("phone");
    // Give debounce + fetch a moment
    await page.waitForTimeout(600);

    // We don't assert on specific suggestions; just ensure the dropdown appears
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
  });
});
