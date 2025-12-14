// src/app/requests/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { headers } from "next/headers";

type SP = Record<string, string | string[] | undefined>;
type HeadersLike = { get(name: string): string | null };

type RequestListItem = {
  id: string;
  kind?: "product" | "service" | string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  tags?: string[] | string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  boostUntil?: string | null;
  status?: string | null;
};

function getParam(sp: SP, key: string): string {
  const v = sp[key];
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v ?? "");
}

function baseUrlFromHeaders(h: HeadersLike): string {
  const env =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    "";
  if (env) return env.replace(/\/+$/, "");

  const proto =
    h.get("x-forwarded-proto") ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function makeApiUrl(path: string, h: HeadersLike): string {
  const base = baseUrlFromHeaders(h);
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

function asListItems(json: any): RequestListItem[] {
  if (Array.isArray(json)) return json as RequestListItem[];
  if (Array.isArray(json?.items)) return json.items as RequestListItem[];
  if (Array.isArray(json?.requests)) return json.requests as RequestListItem[];
  return [];
}

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export default async function RequestsIndex({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const q = getParam(sp, "q").trim();
  const kindRaw = getParam(sp, "kind").trim().toLowerCase();
  const kind = kindRaw === "product" || kindRaw === "service" ? kindRaw : "";
  const category = getParam(sp, "category").trim();
  const status = getParam(sp, "status").trim();

  const qp = new URLSearchParams();
  if (q) qp.set("q", q);
  if (kind) qp.set("kind", kind);
  if (category) qp.set("category", category);
  if (status) qp.set("status", status);

  const h = await headers();
  const url = `${makeApiUrl("/api/requests", h)}${qp.toString() ? `?${qp.toString()}` : ""}`;

  let items: RequestListItem[] = [];
  try {
    const res = await fetch(url, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (res.ok) items = asListItems(j);
  } catch {
    items = [];
  }

  return (
    <main className="container-page py-6">
      <div className="hero-surface">
        <h1 className="text-2xl md:text-3xl font-extrabold">Requests</h1>
        <p className="text-sm text-white/80">Browse what people are looking for. Guests can view summaries.</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href="/requests/new" prefetch={false} className="btn-gradient-primary text-sm">
            Post a request
          </Link>
          <Link href="/search" prefetch={false} className="btn-outline text-sm">
            Browse listings
          </Link>
        </div>
      </div>

      <form
        method="GET"
        action="/requests"
        className="mt-6 rounded-xl border border-border bg-card/90 p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-muted-foreground">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="e.g. iPhone 13, plumber in Nairobi…"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground">Kind</label>
            <select
              name="kind"
              defaultValue={kind || ""}
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              <option value="">All</option>
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground">Category</label>
            <input
              name="category"
              defaultValue={category}
              placeholder="Any"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground">Status</label>
            <input
              name="status"
              defaultValue={status}
              placeholder="Any"
              className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-gradient-primary text-sm">
            Apply filters
          </button>
          <Link
            href="/requests"
            prefetch={false}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Reset
          </Link>

          {items.length === 0 ? (
            <Link
              href={`/requests/new${
                kind || q
                  ? `?${new URLSearchParams({
                      ...(kind ? { kind } : {}),
                      ...(q ? { title: q } : {}),
                    }).toString()}`
                  : ""
              }`}
              prefetch={false}
              className="ml-auto text-xs underline"
            >
              Didn’t find it? Post a request
            </Link>
          ) : null}
        </div>
      </form>

      <section className="mt-6 rounded-xl border border-border bg-card/90 p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Latest</h2>
          <span className="text-xs text-muted-foreground">
            Showing {items.length} request{items.length === 1 ? "" : "s"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No requests yet. Be the first to post one.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => {
              const id = String(r.id || "");
              const href = `/requests/${encodeURIComponent(id)}`;
              const created = fmtDate(r.createdAt);
              const expires = fmtDate(r.expiresAt);
              const boosted = !!(r.boostUntil && new Date(r.boostUntil).getTime() > Date.now());

              const tagsArr = Array.isArray(r.tags)
                ? r.tags
                : typeof r.tags === "string"
                  ? r.tags
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : [];

              return (
                <li key={id}>
                  <Link
                    href={href}
                    prefetch={false}
                    className="block h-full rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:shadow hover:border-brandBlue/70"
                    aria-label={`Request: ${r.title || "Untitled"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {String(r.kind || "request")}
                          {boosted ? " • boosted" : ""}
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
                          {r.title || "Untitled"}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted/50 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                        {r.status || "ACTIVE"}
                      </span>
                    </div>

                    {r.description ? (
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{r.description}</p>
                    ) : null}

                    <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                      {r.location ? (
                        <div>
                          <span className="font-semibold">Location:</span> {r.location}
                        </div>
                      ) : null}
                      {r.category ? (
                        <div>
                          <span className="font-semibold">Category:</span> {r.category}
                        </div>
                      ) : null}
                      {created ? (
                        <div>
                          <span className="font-semibold">Posted:</span> {created}
                          {expires ? (
                            <>
                              {" "}
                              <span className="opacity-60" aria-hidden>
                                •
                              </span>{" "}
                              <span className="font-semibold">Expires:</span> {expires}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {tagsArr.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tagsArr.slice(0, 6).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
