// tests/e2e/link-scan.spec.ts
import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const MAX_PAGES = Number(process.env["LINK_SCAN_MAX_PAGES"] ?? 200);

// Make the scan resilient to slow dynamic SSR pages
const REQUEST_TIMEOUT_MS = Number(process.env["LINK_SCAN_REQUEST_TIMEOUT_MS"] ?? 30_000);
const NAV_TIMEOUT_MS = Number(process.env["LINK_SCAN_NAV_TIMEOUT_MS"] ?? 30_000);
const TEST_TIMEOUT_MS = Number(process.env["LINK_SCAN_TEST_TIMEOUT_MS"] ?? 180_000);

// Statuses that are NOT “missing route” (protected pages are fine)
const OK_NON_404 = new Set([401, 403]);

function isSkippableHref(href: string) {
  if (!href) return true;
  if (href.startsWith("#")) return true;
  if (href.startsWith("mailto:")) return true;
  if (href.startsWith("tel:")) return true;
  if (href.startsWith("sms:")) return true;
  if (href.startsWith("javascript:")) return true;
  return false;
}

function normalizeToPath(baseURL: string, href: string, currentPath: string) {
  const base = new URL(baseURL);
  const abs = new URL(href, new URL(currentPath, base).toString());

  // only same-origin
  if (abs.origin !== base.origin) return null;

  // ignore api + assets
  const p = abs.pathname;
  if (p.startsWith("/api/")) return null;
  if (/\.(png|jpg|jpeg|webp|gif|svg|ico|css|js|map|txt|xml|json|pdf)$/i.test(p)) return null;

  // drop hash and query to avoid infinite param explosions
  return abs.pathname.replace(/\/+$/, "") || "/";
}

async function fetchSitemapPaths(request: APIRequestContext, baseURL: string): Promise<string[]> {
  const res = await request.get("/sitemap.xml", {
    failOnStatusCode: false,
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (!res.ok()) return [];

  const xml = await res.text();

  // TS-safe matchAll handling
  const LOC_RE = /<loc>\s*([^<]+)\s*<\/loc>/g;
  const locs: string[] = [];
  for (const match of xml.matchAll(LOC_RE) as Iterable<RegExpMatchArray>) {
    const loc = match[1];
    if (loc) locs.push(loc);
  }

  const base = new URL(baseURL);
  const paths: string[] = [];

  for (const loc of locs) {
    try {
      const u = new URL(loc);
      if (u.origin !== base.origin) continue;
      paths.push(u.pathname.replace(/\/+$/, "") || "/");
    } catch {
      // ignore
    }
  }

  return Array.from(new Set(paths));
}

function configurePageTimeouts(page: Page) {
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
}

test.describe("link scan", () => {
  test("sitemap URLs do not return 404", async ({ request }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3000");
    const paths = await fetchSitemapPaths(request, baseURL);

    // If sitemap is empty/missing, don’t fail the suite, just assert the homepage works.
    if (!paths.length) {
      const r = await request.get("/", { failOnStatusCode: false, timeout: REQUEST_TIMEOUT_MS });
      expect(r.status(), "Homepage should not be 404").not.toBe(404);
      return;
    }

    const missing: Array<{ path: string; status: number }> = [];

    for (const p of paths) {
      const r = await request.get(p, { failOnStatusCode: false, timeout: REQUEST_TIMEOUT_MS });
      const s = r.status();
      if (s === 404) missing.push({ path: p, status: s });
    }

    expect(
      missing,
      `Sitemap has ${missing.length} missing routes:\n` +
        missing.map((m) => `${m.status} ${m.path}`).join("\n"),
    ).toEqual([]);
  });

  test("crawl public pages and fail on internal 404s", async ({ page }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT_MS);
    configurePageTimeouts(page);

    const baseURL = String(testInfo.project.use.baseURL || "http://localhost:3000");

    const queue: string[] = ["/"];
    const queued = new Set<string>(queue);
    const visited = new Set<string>();
    const missing: Array<{ path: string; status: number }> = [];

    while (queue.length && visited.size < MAX_PAGES) {
      const path = queue.shift()!;
      queued.delete(path);

      if (visited.has(path)) continue;
      visited.add(path);

      const resp = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
      const status = resp?.status() ?? 0;

      if (status === 404) {
        missing.push({ path, status });
        continue;
      }

      // If page is protected, don’t treat as missing route
      if (OK_NON_404.has(status)) continue;

      // Collect internal links
      const hrefs = await page.$$eval("a[href]", (as) =>
        as.map((a) => a.getAttribute("href") || "").filter(Boolean),
      );

      for (const raw of hrefs) {
        const href = String(raw).trim();
        if (isSkippableHref(href)) continue;

        const next = normalizeToPath(baseURL, href, path);
        if (!next) continue;

        if (!visited.has(next) && !queued.has(next)) {
          queue.push(next);
          queued.add(next);
        }
      }
    }

    expect(
      missing,
      `Found ${missing.length} internal 404s:\n` +
        missing.map((m) => `${m.status} ${m.path}`).join("\n"),
    ).toEqual([]);
  });
});
