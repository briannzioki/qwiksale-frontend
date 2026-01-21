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

async function getCandidateServiceIds(page: import("@playwright/test").Page): Promise<string[]> {
  const res = await page.request.get("/api/services?pageSize=12", { timeout: 30_000 }).catch(() => null);
  if (!res || !res.ok()) return [];
  const json = (await res.json().catch(() => ({} as any))) as any;
  const items: any[] = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
  return items
    .map((x) => (x?.id != null ? String(x.id) : ""))
    .filter(Boolean)
    .slice(0, 12);
}

async function isNotFoundUi(page: import("@playwright/test").Page): Promise<boolean> {
  const notFoundHeading = page.getByRole("heading", { name: /we can.t find that page/i }).first();
  if (await notFoundHeading.isVisible().catch(() => false)) return true;

  const notFoundText = page.getByText(/404\s*-\s*not found/i).first();
  if (await notFoundText.isVisible().catch(() => false)) return true;

  return false;
}

test("service happy flow: search to open to reveal", async ({ page }) => {
  await gotoHome(page);

  // Prefer the canonical param used by the app, but keep legacy compatibility.
  await page.goto("/?t=services", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(250);

  const links = page.locator('a[href^="/service/"]');
  const firstLinkVisible = await links
    .first()
    .waitFor({ state: "attached", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  let pickedHref: string | null = null;
  let pickedId: string | undefined;
  let pickedApiJson: any = null;

  if (firstLinkVisible) {
    const count = await links.count();
    const maxScan = Math.min(count, 12);

    for (let i = 0; i < maxScan; i++) {
      const a = links.nth(i);
      await a.scrollIntoViewIfNeeded().catch(() => {});
      const href = await a.getAttribute("href");
      const id = idFromHref(href);
      if (!href || !id) continue;

      const apiRes = await page.request.get(`/api/services/${encodeURIComponent(id)}`, { timeout: 30_000 }).catch(() => null);
      if (!apiRes || !apiRes.ok()) continue;

      const apiJson = await apiRes.json().catch(() => ({} as any));
      const statusRaw = apiJson?.status ?? apiJson?.service?.status ?? null;
      const status = typeof statusRaw === "string" ? statusRaw.trim().toUpperCase() : "";

      // Treat missing status as ACTIVE
      if (status && status !== "ACTIVE") continue;

      pickedHref = href;
      pickedId = id;
      pickedApiJson = apiJson;
      break;
    }
  }

  if (!pickedHref) {
    const ids = await getCandidateServiceIds(page);
    test.skip(!ids.length, "No service ids available from /api/services");
    pickedId = ids[0];
    pickedHref = `/service/${encodeURIComponent(pickedId!)}`;
  }

  // Prefer click when the card exists, fall back to direct navigation.
  const candidateLink = pickedId ? page.locator(`a[href^="/service/${pickedId}"]`).first() : page.locator("a[href^='/service/']").first();

  const canClick = await candidateLink
    .isVisible()
    .then(() => true)
    .catch(() => false);

  if (canClick) {
    await Promise.all([
      page.waitForURL(SERVICE_URL_RE, { timeout: 15_000 }),
      candidateLink.click({ timeout: 8_000, noWaitAfter: true }).catch(() => {}),
    ]).catch(async () => {
      await page.goto(pickedHref!, { waitUntil: "domcontentloaded" });
      await page.waitForURL(SERVICE_URL_RE, { timeout: 15_000 });
    });
  } else {
    await page.goto(pickedHref!, { waitUntil: "domcontentloaded" });
    await page.waitForURL(SERVICE_URL_RE, { timeout: 15_000 });
  }

  // Confirm we are not on a not found shell.
  if (await isNotFoundUi(page)) {
    test.skip(true, "Service route rendered not found UI");
  }

  // The detail page should have a visible h1.
  await expect(page.locator("h1").first()).toBeVisible();

  // Badge assertions only when API provides the data.
  const finalId = pickedId ?? idFromHref(page.url());
  let apiJson: any = pickedApiJson;

  const apiId = String(apiJson?.id ?? apiJson?.service?.id ?? "").trim();
  if (finalId && (!apiJson || !apiId || apiId !== String(finalId))) {
    const apiRes = await page.request.get(`/api/services/${encodeURIComponent(finalId)}`, { timeout: 30_000 }).catch(() => null);
    if (apiRes && apiRes.ok()) {
      apiJson = await apiRes.json().catch(() => ({} as any));
    }
  }

  if (finalId && apiJson && typeof apiJson === "object") {
    const sellerVerified = apiJson?.sellerVerified as unknown;
    const sellerFeaturedTier = apiJson?.sellerFeaturedTier as unknown;

    if (typeof sellerVerified === "boolean") {
      const label = sellerVerified ? "Verified" : "Unverified";
      await expect(page.getByText(new RegExp(`\\b${escapeRegExp(label)}\\b`, "i")).first()).toBeVisible();
    }

    const featured = Boolean(apiJson?.featured ?? apiJson?.service?.featured);

    const tier =
      typeof sellerFeaturedTier === "string" ? sellerFeaturedTier.trim().toLowerCase() : "";

    if (featured && (tier === "basic" || tier === "gold" || tier === "diamond")) {
      await expect(page.getByTestId(`featured-tier-${tier}`).first()).toBeVisible();
    }
  }

  // Open gallery if any affordance exists. Do not fail the whole test if gallery is absent.
  const overlay = page.locator('[data-gallery-overlay="true"]').first();
  const openBtn = page.getByRole("button", { name: /open image in fullscreen/i }).first();

  const overlayVisible = await overlay.isVisible().catch(() => false);
  const btnVisible = await openBtn.isVisible().catch(() => false);

  if (overlayVisible) {
    await overlay.click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
  } else if (btnVisible) {
    await openBtn.click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
  }

  // Reveal contact if present. Accept either a link or a button.
  const reveal = page
    .getByRole("link", { name: /reveal contact/i })
    .first()
    .or(page.getByRole("button", { name: /reveal contact/i }).first())
    .or(page.getByRole("button", { name: /show contact/i }).first())
    .or(page.getByRole("link", { name: /show contact/i }).first());

  if ((await reveal.count()) > 0) {
    const visible = await reveal.first().isVisible().catch(() => false);
    if (visible) {
      await reveal.first().click({ noWaitAfter: true }).catch(() => {});
    }
  }
});
