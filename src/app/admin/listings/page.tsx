// src/app/admin/listings/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import { prisma } from "@/app/lib/prisma";

export const metadata: Metadata = {
  title: "Listings · QwikSale Admin",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

type Listing = {
  id: string;
  kind: "product" | "service";
  name: string;
  price: number | null;
  featured: boolean | null;
  createdAt: string | null;
  sellerName: string | null;
  sellerId: string | null;
};

const FETCH_TIMEOUT_MS = 2500;
const PAGE_SIZE = 50;
const API_LIMIT = 200;

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T | (() => T),
): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) =>
      setTimeout(
        () =>
          resolve(
            typeof fallback === "function"
              ? (fallback as any)()
              : fallback,
          ),
        ms,
      ),
    ),
  ]);
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  ms: number,
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return "—";
  }
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
    return new Date(iso!).toLocaleDateString();
  }
};

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  searchParams?: Promise<SearchParams>;
};

function getParam(sp: SearchParams, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}

function keepQuery(
  base: string,
  sp: SearchParams,
  overrides: Partial<Record<"page" | "q" | "type" | "featured", string>>,
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
    if (v == null || v === "") {
      qp.delete(k);
    } else {
      qp.set(k, v);
    }
  });

  const qs = qp.toString();
  return qs ? `${base}?${qs}` : base;
}

// Accept various API payload shapes: array, {listings:[]}, {data:[]}, {items:[]}, {rows:[]}
function normalizeListingsPayload(payload: unknown): Listing[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload as Listing[];
  }
  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const keys = ["listings", "data", "items", "rows"];
    for (const key of keys) {
      const maybe = obj[key];
      if (Array.isArray(maybe)) {
        return maybe as Listing[];
      }
    }
  }
  return [];
}

// Fallback: direct Prisma query if /api/admin/listings fails or returns 0 rows.
async function fetchListingsFallback(opts: {
  q: string;
  type: "any" | "product" | "service";
  featured: "any" | "yes" | "no";
  limit: number;
}): Promise<Listing[]> {
  const { q, type, featured, limit } = opts;

  const baseWhere: Record<string, unknown> = {};
  if (featured === "yes") baseWhere["featured"] = true;
  if (featured === "no") baseWhere["featured"] = false;
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    baseWhere["OR"] = [
      { name: like },
      { sellerName: like } as any,
    ];
  }

  const orderBy = [
    { createdAt: "desc" as const },
    { id: "desc" as const },
  ];

  const wantsProduct = type === "any" || type === "product";
  const wantsService = type === "any" || type === "service";

  const split =
    wantsProduct && wantsService ? Math.max(1, Math.floor(limit / 2)) : limit;
  const takeProducts = wantsProduct ? split : 0;
  const takeServices = wantsService ? limit - takeProducts : 0;

  const [productRows, serviceRows] = await Promise.all([
    wantsProduct
      ? prisma.product.findMany({
          where: baseWhere,
          orderBy,
          take: takeProducts,
          select: {
            id: true,
            name: true,
            price: true,
            featured: true,
            createdAt: true,
            sellerId: true as any,
            sellerName: true as any,
            seller: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([] as any[]),
    wantsService
      ? prisma.service.findMany({
          where: baseWhere,
          orderBy,
          take: takeServices,
          select: {
            id: true,
            name: true,
            price: true,
            featured: true,
            createdAt: true,
            sellerId: true as any,
            sellerName: true as any,
            seller: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([] as any[]),
  ]);

  const rows: Listing[] = [
    ...productRows.map((p: any) => ({
      id: String(p.id),
      kind: "product" as const,
      name: String(p.name ?? ""),
      price: typeof p.price === "number" ? p.price : null,
      featured: typeof p.featured === "boolean" ? p.featured : null,
      createdAt:
        p.createdAt instanceof Date
          ? p.createdAt.toISOString()
          : p.createdAt
          ? String(p.createdAt)
          : null,
      sellerName: (p.sellerName as string) ?? p.seller?.name ?? null,
      sellerId: (p.sellerId as string) ?? p.seller?.id ?? null,
    })),
    ...serviceRows.map((s: any) => ({
      id: String(s.id),
      kind: "service" as const,
      name: String(s.name ?? ""),
      price: typeof s.price === "number" ? s.price : null,
      featured: typeof s.featured === "boolean" ? s.featured : null,
      createdAt:
        s.createdAt instanceof Date
          ? s.createdAt.toISOString()
          : s.createdAt
          ? String(s.createdAt)
          : null,
      sellerName: (s.sellerName as string) ?? s.seller?.name ?? null,
      sellerId: (s.sellerId as string) ?? s.seller?.id ?? null,
    })),
  ];

  return rows;
}

/**
 * Admin-only listings view.
 * Access enforced by:
 * - /admin/layout via requireAdmin()
 * - middleware for /api/admin/listings
 */
export default async function Page({ searchParams }: PageProps) {
  const sp: SearchParams = ((await searchParams) ?? {}) as SearchParams;

  const q = (getParam(sp, "q") || "").trim();
  const type = (getParam(sp, "type") || "any") as "any" | "product" | "service";
  const featured = (getParam(sp, "featured") || "any") as
    | "any"
    | "yes"
    | "no";
  const page = Math.max(1, Number(getParam(sp, "page") || 1));

  const qs = new URLSearchParams();
  qs.set("limit", String(API_LIMIT));
  if (q) qs.set("q", q);
  if (type !== "any") qs.set("type", type);
  if (featured !== "any") {
    qs.set("featured", featured === "yes" ? "true" : "false");
  }

  let rows: Listing[] | null = null;
  let lastStatus = 0;
  let hadApiError = false;

  try {
    const res = await fetchWithTimeout(
      `/api/admin/listings?${qs.toString()}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      },
      FETCH_TIMEOUT_MS,
    );
    lastStatus = res.status;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await withTimeout(res.json(), 800, []);
    rows = normalizeListingsPayload(json);
  } catch {
    rows = null;
    hadApiError = true;
  }

  let source: Listing[] = Array.isArray(rows) ? rows : [];
  let hadFallbackError = false;

  if (source.length === 0) {
    try {
      source = await fetchListingsFallback({
        q,
        type,
        featured,
        limit: API_LIMIT,
      });
    } catch {
      hadFallbackError = true;
    }
  }

  const softError =
    hadApiError && hadFallbackError
      ? lastStatus === 403
        ? "You need admin access to view listings."
        : "Failed to load listings. Showing an empty list."
      : null;

  const total = source.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = source.slice(start, end);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h2"
        title="Admin · Listings"
        subtitle={`Products & services across the marketplace. Showing ${total.toLocaleString()}.`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin" className="btn-outline text-sm" prefetch={false}>
              Admin home
            </Link>
            <Link
              href="/admin/moderation"
              className="btn-gradient-primary text-sm"
              prefetch={false}
            >
              Moderation
            </Link>
          </div>
        }
      />

      <h1 className="text-2xl font-bold">All Listings</h1>

      {softError && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {softError}
        </div>
      )}

      {/* Filters */}
      <form
        method="GET"
        action="/admin/listings"
        className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className="label">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, seller…"
              className="input"
            />
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
            <select
              name="featured"
              defaultValue={featured}
              className="select"
            >
              <option value="any">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <input type="hidden" name="page" value="1" />
          <div className="md:col-span-12 flex items-end gap-2 pt-1">
            <button className="btn-gradient-primary">Apply</button>
            <Link
              href="/admin/listings"
              className="btn-outline"
              prefetch={false}
            >
              Clear
            </Link>
          </div>
        </div>
      </form>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">Listings</h2>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            Total: {total.toLocaleString()} • Page {safePage} / {totalPages}
          </span>
        </div>

        {pageRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600 dark:text-slate-300">
            No listings found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">
                  Admin listing table showing products and services with seller
                  and featured status
                </caption>
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
                          href={
                            r.kind === "product"
                              ? `/product/${r.id}`
                              : `/service/${r.id}`
                          }
                          prefetch={false}
                          className="underline text-[#161748] dark:text-[#39a0ca]"
                        >
                          <span className="line-clamp-1">{r.name}</span>
                        </Link>
                      </Td>
                      <Td>{fmtKES(r.price)}</Td>
                      <Td>
                        {r.featured ? (
                          <Badge tone="indigo">Featured</Badge>
                        ) : (
                          <Badge>—</Badge>
                        )}
                      </Td>
                      <Td>
                        {r.sellerName ?? "—"}{" "}
                        {r.sellerId && (
                          <span className="font-mono text-[11px] opacity-70">
                            ({r.sellerId})
                          </span>
                        )}
                      </Td>
                      <Td>{fmtDateKE(r.createdAt)}</Td>
                      <Td>
                        <div className="flex gap-2">
                          <Link
                            href={
                              r.kind === "product"
                                ? `/product/${r.id}/edit`
                                : `/service/${r.id}/edit`
                            }
                            prefetch={false}
                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            Edit
                          </Link>
                          <Link
                            href={
                              r.kind === "product"
                                ? `/product/${r.id}`
                                : `/service/${r.id}`
                            }
                            prefetch={false}
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
                    ? keepQuery("/admin/listings", sp, {
                        page: String(safePage - 1),
                      })
                    : "#"
                }
                prefetch={false}
                aria-disabled={safePage <= 1}
                className={`rounded border px-3 py-1 transition ${
                  safePage > 1
                    ? "hover:shadow dark:border-slate-800"
                    : "opacity-50 dark:border-slate-800"
                }`}
              >
                ← Prev
              </Link>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(7, totalPages) }).map(
                  (_, i) => {
                    const half = 3;
                    let p = i + 1;
                    if (totalPages > 7) {
                      const start = Math.max(
                        1,
                        Math.min(safePage - half, totalPages - 6),
                      );
                      p = start + i;
                    }
                    const isCurrent = p === safePage;

                    return (
                      <Link
                        key={p}
                        href={keepQuery("/admin/listings", sp, {
                          page: String(p),
                        })}
                        prefetch={false}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`rounded px-2 py-1 ${
                          isCurrent
                            ? "bg-[#161748] text-white"
                            : "hover:bg-black/5 dark:hover:bg:white/10"
                        }`}
                      >
                        {p}
                      </Link>
                    );
                  },
                )}
              </div>

              <Link
                href={
                  safePage < totalPages
                    ? keepQuery("/admin/listings", sp, {
                        page: String(safePage + 1),
                      })
                    : "#"
                }
                prefetch={false}
                aria-disabled={safePage >= totalPages}
                className={`rounded border px-3 py-1 transition ${
                  safePage < totalPages
                    ? "hover:shadow dark:border-slate-800"
                    : "opacity-50 dark:border-slate-800"
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-2 text-left font-semibold">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-2 align-middle ${
        className ?? ""
      }`}
    >
      {children}
    </td>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "indigo";
}) {
  const map: Record<string, string> = {
    slate:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    green:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    amber:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    rose:
      "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
    indigo:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}
