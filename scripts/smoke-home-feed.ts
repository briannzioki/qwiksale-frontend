// scripts/smoke-home-feed.ts
/** Smoke the home-feed API against local OR prod, depending on env.
 *  Usage:
 *   BASE=https://qwiksale.sale pnpm smoke:feed
 *   # or just: pnpm smoke:feed  (defaults to http://127.0.0.1:3000)
 */
const BASE =
  process.env.BASE ||
  process.env.SMOKE_BASE ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://127.0.0.1:3000";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
  console.log("✓", msg);
}

async function getJson(path: string) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

(async () => {
  const p = await getJson(`/api/home-feed?t=products&limit=6&facets=true`);
  assert(p.mode === "products", "products: mode=products");
  assert(p.items?.length > 0, "products: items > 0");
  assert(p.pageSize === 6, "products: pageSize=6");
  assert(p.facets && Object.keys(p.facets).length > 0, "products: facets present");

  const s = await getJson(`/api/home-feed?t=services&limit=6&facets=true`);
  assert(s.mode === "services", "services: mode=services");
  assert(Array.isArray(s.items), "services: items ok");
  assert(s.pageSize === 6, "services: pageSize=6");
  assert(s.facets && "categories" in s.facets, "services: facets ok");

  const a = await getJson(`/api/home-feed?limit=8`);
  assert(a.mode === "all", "all: mode=all");
  assert(a.items?.length > 0, "all: items > 0");

  console.log("\nAll home-feed smokes passed ✅");
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
