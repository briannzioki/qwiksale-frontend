// src/app/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import HomeClientNoSSR from "./_components/HomeClientNoSSR";

/** Types mirrored from /api/home-feed */
type Mode = "all" | "products" | "services";
type RawSearchParams = Record<string, string | string[] | undefined>;

/** Build absolute URL on the server (works in dev and prod) */
function makeApiUrl(path: string) {
  const explicit = process.env["NEXT_PUBLIC_APP_URL"];
  const vercel = process.env["VERCEL_URL"];
  const base =
    explicit ||
    (vercel ? (vercel.startsWith("http") ? vercel : `https://${vercel}`) : null) ||
    "http://127.0.0.1:3000";
  return new URL(path, base);
}

/** Read from Promise<ReadonlyURLSearchParams|URLSearchParams|object> (Next 15-safe) */
async function readParam(
  spPromise: Promise<any> | undefined,
  key: string
): Promise<string | null> {
  if (!spPromise) return null;
  const r: any = await spPromise;

  // URLSearchParams/ReadonlyURLSearchParams
  if (r && typeof r.get === "function") {
    try {
      const v = r.get(key);
      return v == null ? null : String(v);
    } catch {
      /* ignore */
    }
  }

  // Plain object
  if (r && typeof r === "object") {
    const v = (r as RawSearchParams)[key];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return (v[0] as string) ?? null;
  }
  return null;
}

function normalizeMode(raw?: string | null): Mode {
  const t = (raw ?? "all").toLowerCase();
  if (t === "products" || t === "product" || t === "prod") return "products";
  if (t === "services" || t === "service" || t === "svc" || t === "svcs") return "services";
  return "all";
}

export default async function HomePage({
  // IMPORTANT: Promise<any> to satisfy Next 15 PageProps checker
  searchParams,
}: {
  searchParams: Promise<any>;
}) {
  // Derive initial mode/query purely to *warm* the API. Do not render results here.
  const mode = normalizeMode(await readParam(searchParams, "t"));
  const q = await readParam(searchParams, "q"); // may be null

  // --- Warm the unified feed (no render) ------------------------------------
  try {
    const params = new URLSearchParams();
    params.set("t", mode);
    params.set("pageSize", "24");
    if (q) params.set("q", q);
    // If a specific tab, hint the API to include facets (optional)
    if (mode !== "all") params.set("facets", "true");

    const apiUrl = makeApiUrl(`/api/home-feed?${params.toString()}`);
    // no-store to avoid stale during E2E & production
    await fetch(apiUrl, { cache: "no-store", headers: { Accept: "application/json" } }).catch(
      () => {}
    );
  } catch {
    // swallow – warming fetch is best-effort
  }
  // --------------------------------------------------------------------------

  // Render ONLY the client surface (it owns tabs/search/facets/grid).
  return (
    <main className="min-h-dvh">
      <HomeClientNoSSR />
    </main>
  );
}
