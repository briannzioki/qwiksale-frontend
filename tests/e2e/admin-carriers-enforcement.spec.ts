import { test, expect, type Page, type Browser } from "@playwright/test";

const STORAGE_ADMIN = "tests/e2e/.auth/admin.json";
const STORAGE_USER = "tests/e2e/.auth/user.json";

async function ensureCarrierProfileViaApi(page: Page) {
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
    // Allow "already registered" style responses if your API returns a conflict.
    if (res.status() === 409 || /already|exists|registered/i.test(body)) return;
    throw new Error(`POST /api/carrier/register failed: ${res.status()} ${body}`);
  }
}

async function adminFindCarrierIdByEmail(page: Page, email: string) {
  const res = await page.request.get("/api/admin/carriers");
  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET /api/admin/carriers failed: ${res.status()} ${body}`);
  }

  const data = (await res.json().catch(() => null)) as any;

  const list =
    (Array.isArray(data) ? data : null) ??
    (Array.isArray(data?.carriers) ? data.carriers : null) ??
    (Array.isArray(data?.items) ? data.items : null) ??
    [];

  const match = list.find((c: any) => {
    const u = c?.user ?? c?.User ?? null;
    const em = (c?.email ?? u?.email ?? "").toString().toLowerCase();
    return em === email.toLowerCase();
  });

  const id = match?.id ?? match?.carrierId ?? match?.carrierProfileId ?? null;
  if (!id) {
    throw new Error(`Could not find carrier id for email ${email} from /api/admin/carriers response.`);
  }
  return String(id);
}

async function newAuthedPage(browser: Browser, storageStatePath: string): Promise<Page> {
  const ctx = await browser.newContext({ storageState: storageStatePath });
  const page = await ctx.newPage();
  // Ensure cleanup is tied to the page lifecycle
  (page as any).__ctx = ctx;
  return page;
}

async function closeAuthedPage(page: Page) {
  const ctx = (page as any).__ctx;
  try {
    await page.close().catch(() => {});
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

test("admin can suspend/ban and carrier gets blocked", async ({ browser }) => {
  const userEmail = process.env["E2E_USER_EMAIL"];
  const adminEmail = process.env["E2E_ADMIN_EMAIL"];

  test.skip(!userEmail || !adminEmail, "E2E_USER_EMAIL and E2E_ADMIN_EMAIL must be set");

  const userPage = await newAuthedPage(browser, STORAGE_USER);
  const adminPage = await newAuthedPage(browser, STORAGE_ADMIN);

  try {
    // 1) Ensure user has a carrier profile (API-only; stable)
    await ensureCarrierProfileViaApi(userPage);

    // 2) Confirm admin carriers page opens (UI coverage)
    await adminPage.goto("/admin/carriers", { waitUntil: "domcontentloaded" });
    await expect(adminPage).toHaveURL(/\/admin\/carriers(\?|$)/i, { timeout: 15_000 });

    // 3) Ban the carrier via API (stable enforcement coverage)
    const carrierId = await adminFindCarrierIdByEmail(adminPage, userEmail!);

    const banRes = await adminPage.request.post("/api/admin/carriers/ban", {
      data: { carrierId, banned: true, reason: "e2e enforcement test" },
    });

    if (!banRes.ok()) {
      const body = await banRes.text().catch(() => "");
      throw new Error(`POST /api/admin/carriers/ban failed: ${banRes.status()} ${body}`);
    }

    // 4) Carrier should be blocked on /carrier and reflected by /api/carrier/me.
    await userPage.goto("/carrier", { waitUntil: "domcontentloaded" });

    const enforcementText = userPage.getByText(/banned|suspended|blocked/i).first();
    await expect(enforcementText).toBeVisible({ timeout: 15_000 });

    const meRes = await userPage.request.get("/api/carrier/me");
    if (!meRes.ok()) {
      const body = await meRes.text().catch(() => "");
      throw new Error(`GET /api/carrier/me failed: ${meRes.status()} ${body}`);
    }
    const me = (await meRes.json().catch(() => null)) as any;
    const bannedAt = me?.bannedAt ?? me?.carrier?.bannedAt ?? null;
    expect(bannedAt).toBeTruthy();
  } finally {
    await closeAuthedPage(adminPage);
    await closeAuthedPage(userPage);
  }
});
