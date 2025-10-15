// src/app/admin/listings/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";

export const metadata: Metadata = {
  title: "Listings · QwikSale Admin",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

type Listing = {
  id: string;
  kind: "product" | "service";
  name: string;
  price: number | null;
  featured: boolean | null;
  createdAt: string | null; // ISO
  sellerName: string | null;
  sellerId: string | null;
};

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

const fmtDateKE = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "medium",
      timeZone: "Africa/Nairobi",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
};

/* ------------------------- search param helpers ------------------------- */
type SearchParams = Record<string, string | string[] | undefined>;
function getParam(sp: SearchParams, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}

const PAGE_SIZE = 50;

function keepQuery(
  base: string,
  sp: SearchParams,
  overrides: Partial<Record<"page" | "q" | "type" | "featured", string>>
) {
  const url = new URL(base, "http://x");
  const qp = url.searchParams;

  const q = (getParam(sp, "q") || "").trim();
  const type = (getParam(sp, "type") || "").trim();
  const featured = (getParam(sp, "featured") || "").trim();
  const page = (getParam(sp, "page") || "").trim();

  if (q) qp.set("q", q);
  if (type) qp.set("type", type);
  if (featured) qp.set("featured", featured);
  if (page) qp.set("page", page);

  Object.entries(overrides).forEach(([k, v]) => {
    if (v == null || v === "") qp.delete(k);
    else qp.set(k, v);
  });

  const qs = qp.toString();
  return qs ? `${base}?${qs}` : base;
}

/* --------------------------------- Page --------------------------------- */
export default async function Page({
  searchParams,
}: {
  // Next 15: searchParams is a Promise
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const q = (getParam(sp, "q") || "").trim();
  const type = (getParam(sp, "type") || "any") as "any" | "product" | "service";
  const featured = (getParam(sp, "featured") || "any") as "any" | "yes" | "no";
  const page = Math.max(1, Number(getParam(sp, "page") || 1));

  // Build API query (server returns a flat array; we paginate locally)
  const qs = new URLSearchParams();
  qs.set("limit", "200");
  if (q) qs.set("q", q);
  if (type !== "any") qs.set("type", type);
  if (featured !== "any") qs.set("featured", featured === "yes" ? "true" : "false");

  let rows: Listing[] | null = null;
  try {
    const res = await fetch(`/api/admin/listings?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = (await res.json()) as Listing[];
  } catch {
    rows = null;
  }

  if (!rows) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-rose-600 dark:border-slate-800 dark:bg-slate-900 dark:text-rose-400">
        Failed to load listings.
      </div>
    );
  }

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = rows.slice(start, end);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Admin · Listings"
        subtitle={`Products & services across the marketplace. Showing ${total.toLocaleString()}.`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin" className="btn-outline text-sm">
              Admin home
            </Link>
            <Link href="/admin/moderation" className="btn-gradient-primary text-sm">
              Moderation
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <form
        method="GET"
        action="/admin/listings"
        className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="label">Search</label>
            <input name="q" defaultValue={q} placeholder="Name, seller…" className="input" />
          </div>
          <div className="md:col-span-3">
            <label className="label">Type</label>
            <select name="type" defaultValue={type} className="select">
              <option value="any">Any</option>
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="label">Featured</label>
            <select name="featured" defaultValue={featured} className="select">
              <option value="any">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          {/* preserve the page only if set; form submit will recompute anyway */}
          <input type="hidden" name="page" value="1" />
          <div className="md:col-span-12 flex items-end gap-2 pt-1">
            <button className="btn-gradient-primary">Apply</button>
            <Link href="/admin/listings" className="btn-outline" prefetch={false}>
              Clear
            </Link>
          </div>
        </div>
      </form>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">All Listings</h2>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            Total: {total.toLocaleString()} • Page {safePage} / {totalPages}
          </span>
        </div>

        {pageRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600 dark:text-slate-300">No listings found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800/50 dark:text-slate-300">
                  <tr className="text-left">
                    <Th>Type</Th>
                    <Th>Name</Th>
                    <Th>Price</Th>
                    <Th>Featured</Th>
                    <Th>Seller</Th>
                    <Th>Created</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {pageRows.map((r) => (
                    <tr
                      key={`${r.kind}:${r.id}`}
                      className="hover:bg-gray-50/60 dark:hover:bg-slate-800/60"
                    >
                      <Td>
                        <Badge tone={r.kind === "product" ? "indigo" : "green"}>
                          {r.kind === "product" ? "Product" : "Service"}
                        </Badge>
                      </Td>
                      <Td className="max-w-[320px]">
                        <Link
                          href={r.kind === "product" ? `/product/${r.id}` : `/service/${r.id}`}
                          className="underline text-[#161748] dark:text-[#39a0ca]"
                        >
                          <span className="line-clamp-1">{r.name}</span>
                        </Link>
                      </Td>
                      <Td>{fmtKES(r.price)}</Td>
                      <Td>{r.featured ? <Badge tone="indigo">Featured</Badge> : <Badge>—</Badge>}</Td>
                      <Td>
                        {r.sellerName ?? "—"}{" "}
                        {r.sellerId ? (
                          <span className="font-mono text-[11px] opacity-70">({r.sellerId})</span>
                        ) : null}
                      </Td>
                      <Td>{fmtDateKE(r.createdAt)}</Td>
                      <Td>
                        <div className="flex gap-2">
                          {/* ✅ Edit → /…/edit */}
                          <Link
                            href={
                              r.kind === "product"
                                ? `/product/${r.id}/edit`
                                : `/service/${r.id}/edit`
                            }
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            Edit
                          </Link>
                          {/* ✅ View → live page */}
                          <Link
                            href={r.kind === "product" ? `/product/${r.id}` : `/service/${r.id}`}
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            View
                          </Link>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <nav
              className="flex items-center justify-between border-t px-4 py-3 text-sm dark:border-slate-800"
              aria-label="Pagination"
            >
              <Link
                href={
                  safePage > 1
                    ? keepQuery("/admin/listings", sp, { page: String(safePage - 1) })
                    : "#"
                }
                aria-disabled={safePage <= 1}
                className={`rounded border px-3 py-1 transition ${
                  safePage > 1 ? "hover:shadow dark:border-slate-800" : "opacity-50 dark:border-slate-800"
                }`}
              >
                ← Prev
              </Link>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(7, totalPages) }).map((_, i) => {
                  const half = 3;
                  let p = i + 1;
                  if (totalPages > 7) {
                    const start = Math.max(1, Math.min(safePage - half, totalPages - 6));
                    p = start + i;
                  }
                  const isCurrent = p === safePage;
                  return (
                    <Link
                      key={p}
                      href={keepQuery("/admin/listings", sp, { page: String(p) })}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`rounded px-2 py-1 ${
                        isCurrent ? "bg-[#161748] text-white" : "hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      {p}
                    </Link>
                  );
                })}
              </div>

              <Link
                href={
                  safePage < totalPages
                    ? keepQuery("/admin/listings", sp, { page: String(safePage + 1) })
                    : "#"
                }
                aria-disabled={safePage >= totalPages}
                className={`rounded border px-3 py-1 transition ${
                  safePage < totalPages ? "hover:shadow dark:border-slate-800" : "opacity-50 dark:border-slate-800"
                }`}
              >
                Next →
              </Link>
            </nav>
          </>
        )}
      </section>
    </div>
  );
}

/* ===== UI bits ===== */
function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-2 text-left font-semibold">{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return <td className={`whitespace-nowrap px-4 py-2 align-middle ${className ?? ""}`}>{children}</td>;
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "indigo";
}) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    rose: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
    indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}
