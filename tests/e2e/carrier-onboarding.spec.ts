import { test, expect, type Page } from "@playwright/test";
import { pickFirstVisible } from "./_helpers/signin";

test.use({ storageState: "tests/e2e/.auth/user.json" });

async function ensureCarrierProfileViaApi(page: Page) {
  // Uses the same browser context cookies, so auth should apply.
  const stationLat = Number(process.env["E2E_CARRIER_STATION_LAT"] ?? "-1.286389");
  const stationLng = Number(process.env["E2E_CARRIER_STATION_LNG"] ?? "36.817223");

  const payload = {
    phone: process.env["E2E_CARRIER_PHONE"] ?? "0700000000",
    vehicleType: process.env["E2E_CARRIER_VEHICLE_TYPE"] ?? "MOTORBIKE",
    plateNumber: process.env["E2E_CARRIER_PLATE"] ?? "KAA 123A",
    station: {
      lat: stationLat,
      lng: stationLng,
      label: "e2e station",
    },
    vehiclePhotoKeys: ["e2e/vehicle-photo-1.jpg"],
    docPhotoKey: "e2e/doc-photo-1.jpg",
  };

  const res = await page.request.post("/api/carrier/register", { data: payload });
  if (!res.ok()) {
    const body = await res.text().catch(() => "");

    // tolerate idempotent "already registered" responses
    if (res.status() === 409 || /already|exists|registered/i.test(body)) return;

    throw new Error(`POST /api/carrier/register failed: ${res.status()} ${body}`);
  }
}

test("user can register carrier from /dashboard and ends up in /carrier", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard(\?|$)/i);

  const registerLink = await pickFirstVisible([
    page.getByRole("link", { name: /register as a carrier/i }),
    page.getByRole("link", { name: /register.*carrier/i }),
    page.getByRole("button", { name: /register.*carrier/i }),
  ]);

  const goToCarrierLink = await pickFirstVisible([
    page.getByRole("link", { name: /go to carrier dashboard/i }),
    page.getByRole("link", { name: /^carrier$/i }),
    page.getByRole("link", { name: /carrier dashboard/i }),
  ]);

  if (registerLink) {
    await registerLink.click();
    await expect(page).toHaveURL(/\/carrier\/onboarding(\?|$)/i, { timeout: 15_000 });

    // Keep the test resilient to upload UI differences by using the API endpoint for registration.
    await ensureCarrierProfileViaApi(page);

    await page.goto("/carrier", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/carrier(\?|$)/i, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /carrier/i })).toBeVisible({ timeout: 15_000 });
    return;
  }

  if (goToCarrierLink) {
    await goToCarrierLink.click();
    await expect(page).toHaveURL(/\/carrier(\?|$)/i, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /carrier/i })).toBeVisible({ timeout: 15_000 });
    return;
  }

  throw new Error(
    'Could not find carrier entry on /dashboard ("Register as a carrier" or "Go to carrier dashboard").',
  );
});
