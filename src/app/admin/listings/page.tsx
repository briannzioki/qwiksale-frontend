// src/app/admin/listings/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import { prisma } from "@/app/lib/prisma";
import type { ReactNode } from "react";
import { ListingActions } from "./ListingActions.client";

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
  disabled: boolean | null;
  suspended: boolean | null;
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
            typeof fallback === "function" ? (fallback as any)() : fallback,
          ),
        ms,
      ),
    ),
  ]);
}

async function fetchWithTimeout(input: string, init: RequestInit, ms: number) {
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
    return "-";
  }
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

const fmtDateKE = (iso?: string | null) => {
  if (!iso) return "-";
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

function statusToSuspended(row: any): boolean | null {
  if (typeof row?.suspended === "boolean") return row.suspended;
  const s =
    typeof row?.status === "string" ? row.status.trim().toUpperCase() : "";
  if (!s) return null;
  return s === "HIDDEN";
}

// Fallback: direct Prisma query if /api/admin/listings fails or returns 0 rows.
async function fetchListingsFallback(opts: {
  q: string;
  type: "any" | "product" | "service";
  featured: "any" | "yes" | "no";
  limit: number;
}): Promise<Listing[]> {
  const { q, type, featured, limit } = opts;

  const anyPrisma = prisma as any;

  const buildWhere = (includeSellerName: boolean) => {
    const baseWhere: any = {};
    if (featured === "yes") baseWhere.featured = true;
    if (featured === "no") baseWhere.featured = false;

    if (q) {
      const like = { contains: q, mode: "insensitive" as const };
      const or: any[] = [{ name: like }];

      // Only include sellerName if the model actually supports it; we’ll retry without it if Prisma throws.
      if (includeSellerName) {
        or.push({ sellerName: like });
      }

      baseWhere.OR = or;
    }

    return baseWhere;
  };

  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];

  const wantsProduct = type === "any" || type === "product";
  const wantsService = type === "any" || type === "service";

  const split =
    wantsProduct && wantsService ? Math.max(1, Math.floor(limit / 2)) : limit;
  const takeProducts = wantsProduct ? split : 0;
  const takeServices = wantsService ? limit - takeProducts : 0;

  const serviceModel =
    anyPrisma.service ??
    anyPrisma.services ??
    anyPrisma.Service ??
    anyPrisma.Services ??
    null;

  const selectWide: any = {
    id: true,
    name: true,
    price: true,
    featured: true,
    createdAt: true,
    status: true,
    sellerId: true,
    sellerName: true,
    disabled: true,
    suspended: true,
    seller: { select: { id: true, name: true } },
  };

  const selectNarrow: any = {
    id: true,
    name: true,
    price: true,
    featured: true,
    createdAt: true,
    seller: { select: { id: true, name: true } },
  };

  async function safeFindMany(model: any, take: number): Promise<any[]> {
    if (!model?.findMany || take <= 0) return [];
    // 1) where with sellerName, wide select
    try {
      return await model.findMany({
        where: buildWhere(true),
        orderBy,
        take,
        select: selectWide,
      });
    } catch {
      // 2) where without sellerName, wide select
      try {
        return await model.findMany({
          where: buildWhere(false),
          orderBy,
          take,
          select: selectWide,
        });
      } catch {
        // 3) where without sellerName, narrow select
        return await model.findMany({
          where: buildWhere(false),
          orderBy,
          take,
          select: selectNarrow,
        });
      }
    }
  }

  const [productRows, serviceRows] = await Promise.all([
    wantsProduct
      ? safeFindMany(anyPrisma.product ?? prisma.product, takeProducts)
      : Promise.resolve([] as any[]),
    wantsService
      ? safeFindMany(serviceModel, takeServices)
      : Promise.resolve([] as any[]),
  ]);

  const mapped: Listing[] = [
    ...productRows.map((p: any) => {
      const suspended = statusToSuspended(p);
      return {
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
        disabled: typeof p.disabled === "boolean" ? p.disabled : null,
        suspended: typeof suspended === "boolean" ? suspended : null,
      };
    }),
    ...serviceRows.map((s: any) => {
      const suspended = statusToSuspended(s);
      return {
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
        disabled: typeof s.disabled === "boolean" ? s.disabled : null,
        suspended: typeof suspended === "boolean" ? suspended : null,
      };
    }),
  ];

  // Deterministic: sort combined list by createdAt desc, then id desc
  mapped.sort((a, b) => {
    const da = a.createdAt ?? "";
    const db = b.createdAt ?? "";
    if (da !== db) return db.localeCompare(da);
    return String(b.id).localeCompare(String(a.id));
  });

  return mapped;
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
  const featured = (getParam(sp, "featured") || "any") as "any" | "yes" | "no";
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
  const totalFeatured = source.filter((l) => !!l.featured).length;
  const totalDisabled = source.filter((l) => !!l.disabled).length;
  const totalSuspended = source.filter((l) => !!l.suspended).length;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = source.slice(start, end);

  const labelClass = "text-xs font-semibold text-[var(--text-muted)]";
  const inputClass =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const selectClass =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const actionBtnClass =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold border border-[var(--border-subtle)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const actionBtnElevatedClass =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const SectionHeaderAny = SectionHeader as any;

  const prevHref =
    safePage > 1
      ? keepQuery("/admin/listings", sp, { page: String(safePage - 1) })
      : null;

  const nextHref =
    safePage < totalPages
      ? keepQuery("/admin/listings", sp, { page: String(safePage + 1) })
      : null;

  return (
    <div className="space-y-6 text-[var(--text)]">
      <SectionHeaderAny
        as="h2"
        title="Admin · Listings"
        subtitle={`Products & services across the marketplace. Showing ${total.toLocaleString()}.`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin" className={actionBtnClass} prefetch={false}>
              Admin home
            </Link>
            <Link
              href="/admin/users"
              className={actionBtnClass}
              prefetch={false}
            >
              Users
            </Link>
            <Link
              href="/admin/moderation"
              className={actionBtnElevatedClass}
              prefetch={false}
            >
              Moderation
            </Link>
          </div>
        }
      />

      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
        All Listings
      </h1>

      {/* Quick stats */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatPill label="Total" value={total} tone="slate" />
        <StatPill label="Featured" value={totalFeatured} tone="indigo" />
        <StatPill label="Disabled" value={totalDisabled} tone="amber" />
        <StatPill label="Suspended" value={totalSuspended} tone="rose" />
      </section>

      {softError && (
        <div
          role="status"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text)] shadow-soft"
        >
          <span className="text-[var(--text-muted)]">{softError}</span>
        </div>
      )}

      {/* Filters */}
      <form
        method="GET"
        action="/admin/listings"
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <label className={labelClass}>Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, seller…"
              className={inputClass}
            />
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Type</label>
            <select name="type" defaultValue={type} className={selectClass}>
              <option value="any">Any</option>
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={labelClass}>Featured</label>
            <select
              name="featured"
              defaultValue={featured}
              className={selectClass}
            >
              <option value="any">Any</option>
              <option value="yes">Yes only</option>
              <option value="no">Non-featured</option>
            </select>
          </div>
          <input type="hidden" name="page" value="1" />
          <div className="md:col-span-12 flex items-end gap-2 pt-1">
            <button type="submit" className={actionBtnElevatedClass}>
              Apply
            </button>
            <Link
              href="/admin/listings"
              className={actionBtnClass}
              prefetch={false}
            >
              Clear
            </Link>
          </div>
        </div>
      </form>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <h2 className="font-semibold text-[var(--text)]">Listings</h2>
          <span className="text-xs text-[var(--text-muted)]">
            Total: {total.toLocaleString()} • Page {safePage} / {totalPages}
          </span>
        </div>

        {pageRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
            No listings found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">
                  Admin listing table showing products and services with seller,
                  featured and enforcement status
                </caption>

                <thead className="bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  <tr className="text-left">
                    <Th>Type</Th>
                    <Th>Name</Th>
                    <Th>Price</Th>
                    <Th>Featured</Th>
                    <Th>Status</Th>
                    <Th>Seller</Th>
                    <Th>Created</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {pageRows.map((r) => {
                    const isDisabled = !!r.disabled;
                    const isSuspended = !!r.suspended;

                    const statusTone = isSuspended
                      ? "rose"
                      : isDisabled
                        ? "amber"
                        : "green";

                    const statusLabel = isSuspended
                      ? "Suspended"
                      : isDisabled
                        ? "Disabled"
                        : "Active";

                    const rowHighlight =
                      isSuspended || isDisabled ? "bg-[var(--bg-subtle)]" : "";

                    return (
                      <tr
                        key={`${r.kind}:${r.id}`}
                        className={[
                          "transition",
                          "hover:bg-[var(--bg-subtle)]",
                          rowHighlight,
                        ].join(" ")}
                      >
                        <Td>
                          <Badge
                            tone={r.kind === "product" ? "indigo" : "green"}
                          >
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
                            className="font-semibold text-[var(--text)] underline underline-offset-4 hover:opacity-90"
                          >
                            <span className="line-clamp-1">{r.name}</span>
                          </Link>
                        </Td>

                        <Td>{fmtKES(r.price)}</Td>

                        <Td>
                          {r.featured ? (
                            <Badge tone="indigo">Featured</Badge>
                          ) : (
                            <Badge>-</Badge>
                          )}
                        </Td>

                        <Td>
                          <Badge tone={statusTone}>{statusLabel}</Badge>
                        </Td>

                        <Td>
                          {r.sellerName ?? "-"}{" "}
                          {r.sellerId && (
                            <span className="font-mono text-[11px] text-[var(--text-muted)]">
                              ({r.sellerId})
                            </span>
                          )}
                        </Td>

                        <Td>{fmtDateKE(r.createdAt)}</Td>

                        <Td>
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={
                                r.kind === "product"
                                  ? `/product/${r.id}/edit`
                                  : `/service/${r.id}/edit`
                              }
                              prefetch={false}
                              className={[
                                "inline-flex items-center justify-center",
                                "rounded-xl px-2.5 py-1.5 text-xs font-semibold",
                                "border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                                "transition hover:bg-[var(--bg-subtle)]",
                                "active:scale-[.99]",
                                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                              ].join(" ")}
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
                              className={[
                                "inline-flex items-center justify-center",
                                "rounded-xl px-2.5 py-1.5 text-xs font-semibold",
                                "border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                                "transition hover:bg-[var(--bg-subtle)]",
                                "active:scale-[.99]",
                                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                              ].join(" ")}
                            >
                              View
                            </Link>

                            <ListingActions
                              id={r.id}
                              kind={r.kind}
                              suspended={!!r.suspended}
                            />
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <nav
              className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-3 text-sm"
              aria-label="Pagination"
            >
              {prevHref ? (
                <Link
                  href={prevHref}
                  prefetch={false}
                  className={[
                    "inline-flex items-center justify-center",
                    "rounded-xl px-3 py-1.5 font-semibold",
                    "border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                    "transition hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  ].join(" ")}
                >
                  ← Prev
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={[
                    "inline-flex items-center justify-center",
                    "rounded-xl px-3 py-1.5 font-semibold",
                    "border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                    "opacity-50",
                  ].join(" ")}
                >
                  ← Prev
                </span>
              )}

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(7, totalPages) }).map((_, i) => {
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
                      href={keepQuery("/admin/listings", sp, { page: String(p) })}
                      prefetch={false}
                      aria-current={isCurrent ? "page" : undefined}
                      className={[
                        "inline-flex h-8 min-w-[2rem] items-center justify-center",
                        "rounded-xl px-2 text-sm font-semibold",
                        "border transition",
                        isCurrent
                          ? "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]"
                          : "border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
                        "active:scale-[.99]",
                        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                      ].join(" ")}
                    >
                      {p}
                    </Link>
                  );
                })}
              </div>

              {nextHref ? (
                <Link
                  href={nextHref}
                  prefetch={false}
                  className={[
                    "inline-flex items-center justify-center",
                    "rounded-xl px-3 py-1.5 font-semibold",
                    "border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                    "transition hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  ].join(" ")}
                >
                  Next →
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={[
                    "inline-flex items-center justify-center",
                    "rounded-xl px-3 py-1.5 font-semibold",
                    "border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                    "opacity-50",
                  ].join(" ")}
                >
                  Next →
                </span>
              )}
            </nav>
          </>
        )}
      </section>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={[
        "whitespace-nowrap px-4 py-2 text-left",
        "text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={[
        "whitespace-nowrap px-4 py-2 align-middle",
        "text-sm text-[var(--text)]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "indigo";
}) {
  // Token-only styling (keeps tone param for logic/usage, but avoids hardcoded palette colors).
  const map: Record<string, string> = {
    slate:
      "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
    green:
      "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
    amber:
      "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
    rose:
      "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
    indigo:
      "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
  };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        "border",
        map[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

type StatTone = "slate" | "indigo" | "amber" | "rose";

function StatPill({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: StatTone;
}) {
  // Token-only styling (tone kept so callsites don’t change).
  const styles: Record<StatTone, string> = {
    slate: "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
    indigo: "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
    amber: "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
    rose: "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
  };

  return (
    <div
      className={[
        "flex items-center justify-between rounded-full px-3 py-1.5",
        "border shadow-soft",
        styles[tone],
      ].join(" ")}
    >
      <span className="text-xs font-semibold text-[var(--text-muted)]">
        {label}
      </span>
      <span className="text-xs font-extrabold tracking-tight text-[var(--text)]">
        {Number(value || 0).toLocaleString("en-KE")}
      </span>
    </div>
  );
}
