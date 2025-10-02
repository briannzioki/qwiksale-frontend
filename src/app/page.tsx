// src/app/page.tsx
export const runtime = "nodejs"; // keep Node runtime for server features

import Link from "next/link";

/** Shapes mirrored from /api/home-feed */
type Mode = "all" | "products" | "services";
type CombinedItem = {
  type: "product" | "service";
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  location: string | null;
  featured: boolean;
  createdAt: string;
};
type HomeFeedResponse = {
  mode: Mode;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: CombinedItem[];
};

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

/** Read a query param from URLSearchParams or a plain object */
async function readParam(
  spPromise: Promise<any> | undefined,
  key: string
): Promise<string | null> {
  if (!spPromise) return null;
  const r: any = await spPromise;

  // ReadonlyURLSearchParams / URLSearchParams
  if (r && typeof r.get === "function") {
    try {
      const v = r.get(key);
      return v == null ? null : String(v);
    } catch {
      /* fall through */
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

function tabHref(mode: Mode) {
  if (mode === "all") return "/";
  return `/?t=${mode}`;
}

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function labelFor(mode: Mode) {
  if (mode === "all") return "All";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export default async function HomePage({
  // IMPORTANT: Promise<any> keeps Next 15 PageProps checker happy
  searchParams,
}: {
  searchParams: Promise<any>;
}) {
  const t = normalizeMode(await readParam(searchParams, "t"));

  // Always call /api/home-feed for the chosen tab
  const params = new URLSearchParams();
  params.set("limit", "24");
  params.set("pageSize", "24");
  params.set("t", t);
  if (t !== "all") params.set("facets", "true");

  let data: HomeFeedResponse | null = null;
  try {
    const apiUrl = makeApiUrl(`/api/home-feed?${params.toString()}`);
    const res = await fetch(apiUrl, {
      cache: "no-store", // dynamic; avoids Playwright flakiness
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      data = (await res.json()) as HomeFeedResponse;
    }
  } catch {
    // swallow; we render an empty state below
  }

  const items = data?.items ?? [];

  return (
    <main className="min-h-dvh">
      {/* Accessible search form */}
      <section className="px-4 pt-6">
        <form
          role="search"
          aria-label="Site search"
          action="/search"
          method="get"
          className="mx-auto flex max-w-2xl gap-2"
        >
          <input
            id="home-search"
            type="search"
            name="q"
            aria-label="Search"
            placeholder="Search"
            className="flex-1 rounded-lg border px-4 py-2"
          />
          <button type="submit" className="rounded-lg border px-4 py-2">
            Search
          </button>
        </form>
      </section>

      {/* Tabs: All / Products / Services */}
      <nav className="mx-auto mt-6 flex max-w-6xl gap-2 px-4" role="tablist" aria-label="Home feed tabs">
        {(["all", "products", "services"] as Mode[]).map((m) => {
          const selected = t === m;
          return (
            <Link
              key={m}
              href={tabHref(m)}
              role="tab"
              aria-selected={selected}
              aria-controls="search-results"
              className={cls(
                "rounded-lg border px-3 py-1.5 text-sm",
                selected && "bg-black text-white border-black"
              )}
            >
              {labelFor(m)}
            </Link>
          );
        })}
      </nav>

      {/* Results grid (anchors required for E2E tests) */}
      <section
        id="search-results"
        aria-label="Search results"
        className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 py-6 sm:grid-cols-3 md:grid-cols-4"
      >
        {items.length === 0 ? (
          <p className="col-span-full text-sm opacity-70">No results yet.</p>
        ) : (
          items.map((it) => {
            const href = it.type === "product" ? `/product/${it.id}` : `/service/${it.id}`;
            const aria =
              it.type === "product"
                ? `Product: ${it.name ?? "Listing"}`
                : `Service: ${it.name ?? "Listing"}`;
            const dataAttrs =
              it.type === "product"
                ? { "data-product-id": it.id }
                : { "data-service-id": it.id };

            return (
              <Link
                key={`${it.type}:${it.id}`}
                href={href}
                aria-label={aria}
                {...dataAttrs}
                className="group block overflow-hidden rounded-xl border bg-white shadow-sm hover:shadow-md focus:outline-none focus:ring"
              >
                {/* simple image block */}
                <div className="aspect-[4/3] w-full bg-gray-100">
                  {/* using background-image avoids next/image config here */}
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundImage: it.image ? `url(${it.image})` : "none",
                    }}
                    aria-hidden="true"
                  />
                </div>
                <div className="p-3">
                  <div className="line-clamp-1 text-sm font-medium">{it.name}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
                    <span className="line-clamp-1">
                      {it.category || it.subcategory || "—"}
                    </span>
                    <span>
                      {typeof it.price === "number" ? `KSh ${it.price.toLocaleString()}` : "—"}
                    </span>
                  </div>
                  {it.location && (
                    <div className="mt-1 line-clamp-1 text-[11px] text-gray-500">
                      {it.location}
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
