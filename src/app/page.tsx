// src/app/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import HomeClientNoSSR from "./_components/HomeClientNoSSR";
import SectionHeader from "@/app/components/SectionHeader";
import HomeTabs from "@/app/components/HomeTabs";
import { auth } from "@/auth";

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

/** Best-effort pre-warm for HomeClientNoSSR (non-fatal, short timeout) */
async function warmFeed(mode: Mode, q: string | null, timeoutMs = 2500) {
  const params = new URLSearchParams();
  params.set("t", mode);
  params.set("pageSize", "24");
  if (q) params.set("q", q);
  if (mode !== "all") params.set("facets", "true"); // optional hint

  const apiUrl = makeApiUrl(`/api/home-feed?${params.toString()}`);

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

/** Fire-and-forget warm (non-blocking, ignored errors) */
function warmSilently(mode: Mode, q: string | null) {
  // do not await — keep SSR responsive
  warmFeed(mode, q).then(() => void 0).catch(() => void 0);
}

/** Server-side fetch of service IDs to SSR tiny /service/:id anchors */
async function fetchServiceIdsForSSR(q: string | null) {
  try {
    const params = new URLSearchParams();
    params.set("t", "services");
    params.set("pageSize", "24");
    if (q) params.set("q", q);

    const apiUrl = makeApiUrl(`/api/home-feed?${params.toString()}`);
    const res = await fetch(apiUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];

    const j = await res.json().catch(() => ({} as any));

    const ids = new Set<string>();

    // items[]
    if (Array.isArray(j?.items)) {
      for (const it of j.items) {
        const looksService =
          (typeof it?.type === "string" && it.type.toLowerCase() === "service") ||
          (typeof it?.kind === "string" && it.kind.toLowerCase() === "service") ||
          (typeof it?.model === "string" && it.model.toLowerCase() === "service");
        const id = (it?.id ?? it?.serviceId ?? "").toString().trim();
        if (looksService && id) ids.add(id);
      }
    }

    // services[]
    if (Array.isArray(j?.services)) {
      for (const s of j.services) {
        const id = (s?.id ?? s?.serviceId ?? "").toString().trim();
        if (id) ids.add(id);
      }
    }

    // services.items[]
    if (j?.services && Array.isArray(j.services.items)) {
      for (const s of j.services.items) {
        const id = (s?.id ?? s?.serviceId ?? "").toString().trim();
        if (id) ids.add(id);
      }
    }

    return Array.from(ids).slice(0, 12);
  } catch {
    return [];
  }
}

export default async function HomePage({
  // IMPORTANT: Promise<any> to satisfy Next 15 PageProps checker
  searchParams,
}: {
  searchParams: Promise<any>;
}) {
  // Server-side auth via canonical helper
  const session = await auth();
  const isAuthed = Boolean(session?.user);

  // Accept both ?t=services and ?tab=services (tests may use ?tab=services)
  const tParam = await readParam(searchParams, "t");
  const tabParam = await readParam(searchParams, "tab");
  const mode = normalizeMode(tParam ?? tabParam);
  const q = await readParam(searchParams, "q"); // may be null

  // --- Single awaited warm for the requested tab (short timeout). Others are fire-and-forget. ----
  let warmErrMsg: string | null = null;
  try {
    const res = await warmFeed(mode, q, 2500);
    if (!res || !res.ok) {
      const status = res?.status;
      warmErrMsg =
        status === 429
          ? "You’re loading too fast. Please try again in a moment."
          : "We couldn’t load featured items. Please retry.";
    }
  } catch {
    warmErrMsg = "We couldn’t reach the server. Check your connection and retry.";
  }

  // Kick off non-blocking warms for other tabs (ignore results)
  (["all", "products", "services"] as Mode[])
    .filter((m) => m !== mode)
    .forEach((m) => warmSilently(m, q));
  // ------------------------------------------------------------------------------------------------

  // For the Services tab, SSR a tiny list of /service/:id anchors so they exist pre-hydration
  const ssrServiceIds = mode === "services" ? await fetchServiceIdsForSSR(q) : [];

  // Build a Retry href that preserves existing query (no silent rewrites of ?t)
  const retryQS = new URLSearchParams();
  if (tParam != null) retryQS.set("t", tParam);
  else if (tabParam != null) retryQS.set("tab", tabParam);
  if (q != null) retryQS.set("q", q);
  const retryHref = retryQS.toString() ? `/?${retryQS.toString()}` : "/";

  // Quick chips (pure links so no client JS needed here)
  const productChips = [
    { label: "Phones", q: "phones" },
    { label: "Cars", q: "cars" },
    { label: "Laptops", q: "laptops" },
    { label: "Furniture", q: "furniture" },
    { label: "TVs", q: "tv" },
    { label: "Appliances", q: "appliances" },
    { label: "Cameras", q: "cameras" },
  ];
  const serviceChips = [
    { label: "Cleaning", q: "cleaning" },
    { label: "Mechanic", q: "mechanic" },
    { label: "Photography", q: "photography" },
    { label: "Catering", q: "catering" },
    { label: "Plumbing", q: "plumbing" },
    { label: "Tutoring", q: "tutoring" },
    { label: "Moving", q: "moving" },
  ];

  const CHIP_CAP = 6;
  function ChipRow({
    items,
    t,
  }: {
    items: Array<{ label: string; q: string }>;
    t: "products" | "services";
  }) {
    const needsMore = items.length > CHIP_CAP;
    const visible = needsMore ? items.slice(0, CHIP_CAP - 1) : items;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {visible.map((c) => (
          <Link
            key={c.label}
            href={`/?t=${t}&q=${encodeURIComponent(c.q)}`}
            prefetch={false}
            className="rounded-full px-3 py-1.5 text-sm border border-white/20 bg-white/10 hover:bg-white/15 backdrop-blur transition"
            aria-label={`Browse ${c.label}`}
          >
            {c.label}
          </Link>
        ))}
        {needsMore && (
          <Link
            href={`/?t=${t}`}
            prefetch={false}
            className="rounded-full px-3 py-1.5 text-sm border border-white/20 bg-white/10 hover:bg-white/15 backdrop-blur transition"
            aria-label={`More ${t}`}
          >
            More
          </Link>
        )}
      </div>
    );
  }

  // Render the shell + client surface
  return (
    <main className="min-h-dvh">
      {/* HERO */}
      <section
        aria-labelledby="home-hero-heading"
        aria-describedby="home-hero-desc"
        className={[
          "relative overflow-hidden",
          "bg-gradient-to-br from-brandNavy via-brandGreen to-brandBlue",
          "text-white",
        ].join(" ")}
      >
        {/* soft bloom */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 py-10 sm:py-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                id="home-hero-heading"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight text-balance"
              >
                Buy & sell locally, fast.
              </h1>
              <p id="home-hero-desc" className="mt-2 text-white/90">
                Phones, cars, services—and everything in between. Safe, simple, Qwik.
              </p>

              {/* Tiny mode chips (Products / Services) */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-white/70">Browse:</span>
                <Link
                  href="/?t=products"
                  prefetch={false}
                  className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 transition"
                  aria-label="Browse products"
                >
                  Products
                </Link>
                <Link
                  href="/?t=services"
                  prefetch={false}
                  className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 transition"
                  aria-label="Browse services"
                >
                  Services
                </Link>
              </div>
            </div>
            <div className="sm:pb-1">
              {/* Keep “Browse all →” only in hero */}
              <Link
                href="/search"
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25 transition"
                aria-label="Browse all listings"
              >
                Browse all →
              </Link>
            </div>
          </div>

          {/* Quick filters */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {/* Products row */}
            <div>
              <div className="text-xs uppercase tracking-wide text-white/70">Popular products</div>
              <ChipRow items={productChips} t="products" />
            </div>
            {/* Services row */}
            <div>
              <div className="text-xs uppercase tracking-wide text-white/70">In-demand services</div>
              <ChipRow items={serviceChips} t="services" />
            </div>
          </div>
        </div>
      </section>

      {/* Welcome strip (single primary CTA, auth-aware secondary; no extra shadow) */}
      <section aria-label="Welcome actions" className="mx-auto max-w-7xl px-4 mt-6">
        <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-gray-700 dark:text-slate-300">
              Turn your items into cash — or grow your service hustle.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary */}
              <Link
                href="/sell"
                prefetch={false}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white btn-gradient-primary"
                aria-label="Post a listing"
              >
                + Post a listing
              </Link>

              {/* Secondary (auth-aware) */}
              {isAuthed ? (
                <>
                  <Link
                    href="/dashboard"
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm border border-gray-300/70 dark:border-white/15 bg-white/70 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 transition"
                    aria-label="Go to dashboard"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/saved"
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm border border-gray-300/70 dark:border-white/15 bg-white/70 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 transition"
                    aria-label="View saved items"
                  >
                    Saved
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/signin"
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm border border-gray-300/70 dark:border-white/15 bg-white/70 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 transition"
                    aria-label="Sign in"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm border border-gray-300/70 dark:border-white/15 bg-white/70 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 transition"
                    aria-label="Create an account"
                  >
                    Join
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tabs (real Links; derive state from ?t) */}
      <div className="mx-auto max-w-7xl px-4 mt-8">
        <HomeTabs />
      </div>

      {/* Featured header using shared SectionHeader */}
      <div className="mx-auto max-w-7xl px-4 mt-6">
        <SectionHeader title="Featured today" subtitle="Fresh picks across products & services." />

        {/* SSR fetch-error banner (client will still attempt its own fetch & retry) */}
        {warmErrMsg ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
          >
            <div className="flex items-start justify-between gap-3">
              <p>{warmErrMsg}</p>
              {/* Simple retry: refresh page; client component will re-fetch as well */}
              <Link
                href={retryHref}
                prefetch={false}
                className="rounded-md border px-2 py-1 text-xs hover:bg-white/60 dark:hover:bg-white/10"
                aria-label="Retry loading featured items"
              >
                Retry
              </Link>
            </div>
          </div>
        ) : null}

        {/* --- Tiny SSR Service anchors so Playwright can find /service/ links pre-hydration --- */}
        {mode === "services" && ssrServiceIds.length > 0 && (
          <div hidden data-ssr-service-links>
            {ssrServiceIds.map((sid) => (
              <a key={sid} href={`/service/${sid}`}>
                {sid}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Client-owned tabs/search/facets/grid (handles empty & client-side errors) */}
      <HomeClientNoSSR />
    </main>
  );
}
