export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/auth";
import RequestCard from "@/app/requests/_components/RequestCard";

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

function isLocalHost(host: string) {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.startsWith("localhost:") ||
    h.startsWith("127.0.0.1:") ||
    h.endsWith(".localhost") ||
    h.includes(".localhost:")
  );
}

function baseUrlFromHeaders(h: HeadersLike): string {
  // Prefer request headers so SSR always talks to the *current* host (critical for e2e/local).
  const host = h.get("x-forwarded-host") || h.get("host");

  const xfProtoRaw = h.get("x-forwarded-proto") || "";
  const xfProto = xfProtoRaw ? xfProtoRaw.split(",")[0]?.trim().toLowerCase() : "";

  if (host) {
    // If we're on localhost and x-forwarded-proto is missing, do NOT assume https.
    const proto =
      xfProto ||
      (isLocalHost(host)
        ? "http"
        : process.env.NODE_ENV === "production"
          ? "https"
          : "http");

    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  // Fallback only if headers are missing (rare).
  const env =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    "";

  if (env) return env.replace(/\/+$/, "");

  return "http://localhost:3000";
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

  // ✅ your Next typing expects this to be awaited
  const h = await headers();
  const url = `${makeApiUrl("/api/requests", h)}${
    qp.toString() ? `?${qp.toString()}` : ""
  }`;

  let items: RequestListItem[] = [];
  try {
    const res = await fetch(url, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (res.ok) items = asListItems(j);
  } catch {
    items = [];
  }

  const session = await auth();
  const isAuthed = !!((session as any)?.user?.id as string | undefined);

  function hrefFor(id: string) {
    const target = `/requests/${encodeURIComponent(id)}`;
    if (isAuthed) return target;
    return `/signin?callbackUrl=${encodeURIComponent(target)}`;
  }

  const heroBtnPrimary =
    "inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-4 sm:text-sm";
  const heroBtnSecondary =
    "inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-elevated)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-4 sm:text-sm";

  const fieldLabel = "block text-xs font-semibold text-[var(--text-muted)]";
  const inputBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const selectBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus";

  return (
    <main className="container-page py-4 text-[var(--text)] sm:py-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft">
        <div className="container-page py-6 text-white sm:py-8">
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
            Requests
          </h1>
          <p className="mt-1 text-xs text-white/80 sm:text-sm">
            Browse what people are looking for. Guests can view summaries.
          </p>

          {/* IMPORTANT: keep /requests/new out of the top area so selectors don't click it first */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href="/search" prefetch={false} className={heroBtnSecondary}>
              Browse listings
            </Link>
          </div>
        </div>
      </div>

      <form
        method="GET"
        action="/requests"
        className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:mt-6 sm:p-4"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className={fieldLabel}>Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="e.g. iPhone 13, plumber in Nairobi..."
              className={inputBase}
            />
          </div>

          <div className="md:col-span-3">
            <label className={fieldLabel}>Kind</label>
            <select name="kind" defaultValue={kind || ""} className={selectBase}>
              <option value="">All</option>
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={fieldLabel}>Category</label>
            <input
              name="category"
              defaultValue={category}
              placeholder="Any"
              className={inputBase}
            />
          </div>

          <div className="md:col-span-2">
            <label className={fieldLabel}>Status</label>
            <input
              name="status"
              defaultValue={status}
              placeholder="Any"
              className={inputBase}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-4 sm:text-sm"
          >
            Apply filters
          </button>

          <Link
            href="/requests"
            prefetch={false}
            className="text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
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
              className="ml-auto text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
            >
              Didn’t find it? Post a request
            </Link>
          ) : null}
        </div>
      </form>

      <section className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:mt-6 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">Latest</h2>
          <span className="text-xs text-[var(--text-muted)]">
            Showing {items.length} request{items.length === 1 ? "" : "s"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-muted)] sm:p-6">
            <div>No requests yet. Be the first to post one.</div>
            <div className="mt-3">
              <Link href="/requests/new" prefetch={false} className={heroBtnPrimary}>
                Post a request
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 min-[420px]:grid-cols-2 sm:gap-4 md:gap-6 lg:grid-cols-3">
              {items.map((r) => {
                const id = String(r.id || "");
                return (
                  <li key={id}>
                    <RequestCard item={r} href={hrefFor(id)} isAuthed={isAuthed} />
                  </li>
                );
              })}
            </ul>

            {/* CTA AFTER items so request links appear first in DOM */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href="/requests/new" prefetch={false} className={heroBtnPrimary}>
                Post a request
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
