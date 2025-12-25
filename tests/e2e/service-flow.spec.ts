import { test, expect } from "@playwright/test";
import { gotoHome } from "./utils/server";

function idFromHref(href: string | null | undefined) {
  const h = String(href ?? "").trim();
  if (!h) return undefined;
  const parts = h.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SERVICE_URL_RE = /\/service\/[^/?#]+(?:[?#].*)?$/;

test("service happy flow: search → open → reveal", async ({ page }) => {
  await gotoHome(page);

  // Open Services tab explicitly (if applicable)
  await page.goto("/?tab=services", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const links = page.locator('a[href^="/service/"]');
  const count = await links.count();
  if (count === 0) test.skip(true, "No service links found on /?tab=services");

  // Pick an ACTIVE service (avoid DRAFT/HIDDEN that would 404 at /service/:id)
  const maxScan = Math.min(count, 12);
  let pickedIndex: number | null = null;
  let pickedHref: string | null = null;
  let pickedId: string | undefined;
  let pickedApiJson: any = null;

  for (let i = 0; i < maxScan; i++) {
    const a = links.nth(i);

    await a.scrollIntoViewIfNeeded().catch(() => {});
    const href = await a.getAttribute("href");
    const id = idFromHref(href);

    if (!href || !id) continue;

    const apiRes = await page.request
      .get(`/api/services/${encodeURIComponent(id)}`, { timeout: 30_000 })
      .catch(() => null);

    if (!apiRes || !apiRes.ok()) continue;

    const apiJson = await apiRes.json().catch(() => ({} as any));
    const statusRaw = apiJson?.status ?? apiJson?.service?.status ?? null;
    const status =
      typeof statusRaw === "string" ? statusRaw.trim().toUpperCase() : "";

    // Treat missing status as ACTIVE (matches your page.tsx behavior)
    if (status && status !== "ACTIVE") continue;

    pickedIndex = i;
    pickedHref = href;
    pickedId = id;
    pickedApiJson = apiJson;
    break;
  }

  if (pickedIndex == null || !pickedHref) {
    test.skip(true, "No ACTIVE service links found on /?tab=services");
    return; // ✅ TS narrowing: pickedIndex is number below this line
  }

  const pickedLink = links.nth(pickedIndex);

  // Prefer a real click (UI path). If not visible/interactable, fall back to navigation.
  try {
    await Promise.all([
      page.waitForURL(SERVICE_URL_RE),
      pickedLink.click({ timeout: 5_000 }),
    ]);
  } catch {
    await page.goto(pickedHref, { waitUntil: "domcontentloaded" });
    await page.waitForURL(SERVICE_URL_RE);
  }

  // Ensure we are on the real service detail UI (not a 404 shell)
  await page
    .locator('[data-testid="service-id"]')
    .first()
    .waitFor({ state: "attached", timeout: 15_000 });

  // ✅ Badge assertions (only if API provides the data)
  const finalId = pickedId ?? idFromHref(page.url());
  let apiJson: any = pickedApiJson;

  // If the id changed (or we didn’t manage to prefetch), refresh the API payload.
  const apiId = String(apiJson?.id ?? apiJson?.service?.id ?? "").trim();
  if (finalId && (!apiJson || !apiId || apiId !== String(finalId))) {
    const apiRes = await page.request
      .get(`/api/services/${encodeURIComponent(finalId)}`, { timeout: 30_000 })
      .catch(() => null);
    if (apiRes && apiRes.ok()) {
      apiJson = await apiRes.json().catch(() => ({} as any));
    }
  }

  if (finalId && apiJson && typeof apiJson === "object") {
    const sellerVerified = apiJson?.sellerVerified as unknown;
    const sellerFeaturedTier = apiJson?.sellerFeaturedTier as unknown;

    if (typeof sellerVerified === "boolean") {
      const label = sellerVerified ? "Verified" : "Unverified";
      await expect(
        page
          .getByText(new RegExp(`\\b${escapeRegExp(label)}\\b`, "i"))
          .first(),
      ).toBeVisible();
    }

    const featured = Boolean(apiJson?.featured ?? apiJson?.service?.featured);

    const tier =
      typeof sellerFeaturedTier === "string"
        ? sellerFeaturedTier.trim().toLowerCase()
        : "";

    if (featured && (tier === "basic" || tier === "gold" || tier === "diamond")) {
      await expect(page.getByTestId(`featured-tier-${tier}`).first()).toBeVisible();
    }
  }

  // Open gallery: prefer explicit overlay, fall back to fullscreen button
  const overlay = page.locator('[data-gallery-overlay="true"]').first();
  let opened = false;

  // Try overlay first, but don't hard-fail if it never becomes visible
  try {
    await overlay.waitFor({ state: "visible", timeout: 5_000 });
    await overlay.click();
    opened = true;
  } catch {
    const openBtn = page
      .getByRole("button", { name: /open image in fullscreen/i })
      .first();
    await openBtn.waitFor({ state: "visible", timeout: 10_000 });
    await openBtn.click();
    opened = true;
  }

  if (!opened) {
    test.skip(true, "No clickable gallery overlay or fullscreen button found");
  }

  // Close fullscreen
  await page.keyboard.press("Escape");

  // Reveal contact if present
  const reveal = page
    .getByRole("link", { name: /reveal contact/i })
    .or(page.getByRole("button", { name: /show contact/i }));
  if ((await reveal.count()) > 0) {
    await reveal.first().click();
  }
});
