// src/app/admin/moderation/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import ModerationClient from "@/app/admin/moderation/ModerationClient.client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Moderation · QwikSale",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

/* ---------------------- prisma alias for new models ---------------------- */
const db = prisma as unknown as typeof prisma & {
  report?: {
    count: (args: any) => Promise<number>;
    findMany: (args: any) => Promise<any[]>;
  };
};

async function safeReportCount(where?: any): Promise<number> {
  if (db.report?.count) {
    try {
      return db.report.count(where ? { where } : undefined);
    } catch {
      return 0;
    }
  }
  return 0;
}

async function safeReportFindMany(args: any): Promise<any[]> {
  if (db.report?.findMany) {
    try {
      return db.report.findMany(args);
    } catch {
      return [];
    }
  }
  return [];
}

/* ------------------------------ Data access ------------------------------ */
type SearchParams = {
  page?: string;
  q?: string;
  type?: "product" | "service" | "";
  reason?: string;
  resolved?: "1" | "0" | "";
};

const PAGE_SIZE = 50;

function parseParams(sp: SearchParams) {
  const page = Math.max(1, Number(sp.page || 1));
  const q = (sp.q || "").trim();
  const type =
    sp.type === "product" || sp.type === "service" ? sp.type : undefined;
  const reason = (sp.reason || "").trim();
  const resolved =
    sp.resolved === "1"
      ? true
      : sp.resolved === "0"
        ? false
        : undefined;
  return { page, q, type, reason, resolved };
}

function keepQuery(
  base: string,
  current: ReturnType<typeof parseParams>,
  overrides: Partial<{ page: number }>,
) {
  const url = new URL(base, "http://x"); // dummy base to use URLSearchParams
  const sp = url.searchParams;
  if (current.q) sp.set("q", current.q);
  if (current.type) sp.set("type", current.type);
  if (current.reason) sp.set("reason", current.reason);
  if (typeof current.resolved === "boolean")
    sp.set("resolved", current.resolved ? "1" : "0");
  if (overrides.page) sp.set("page", String(overrides.page));
  return base + "?" + sp.toString();
}

async function loadReports({
  page,
  q,
  type,
  reason,
  resolved,
}: ReturnType<typeof parseParams>) {
  const where: any = {};
  if (type) where.listingType = type;
  if (reason) where.reason = reason;
  if (typeof resolved === "boolean") where.resolved = resolved;

  if (q) {
    where.OR = [
      { listingId: { contains: q, mode: "insensitive" } },
      { details: { contains: q, mode: "insensitive" } },
      { ip: { contains: q, mode: "insensitive" } },
      { userId: { contains: q, mode: "insensitive" } },
    ];
  }

  let total = 0;
  let totalPages = 1;
  let safePage = 1;
  let items: any[] = [];

  try {
    total = await safeReportCount(where);
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    safePage = Math.min(Math.max(1, page), totalPages);

    items = await safeReportFindMany({
      where,
      orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
  } catch {
    // fallbacks kept above
  }

  // quick unresolved count for header badge
  let unresolved = 0;
  try {
    unresolved = await safeReportCount({ ...where, resolved: false });
  } catch {
    unresolved = 0;
  }

  return { items, total, totalPages, page: safePage, unresolved };
}

/* --------------------------------- Page --------------------------------- */
export default async function ModerationPage({
  searchParams,
}: {
  // Next 15 passes a Promise here
  searchParams: Promise<SearchParams>;
}) {
  // Admin gate is enforced once in /admin/layout.

  const raw = await searchParams;
  const parsed = parseParams(raw);

  const { items, total, totalPages, page, unresolved } =
    await loadReports(parsed);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] p-6 text-primary-foreground shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold md:text-3xl">
              Moderation
            </h1>
            <p className="mt-1 text-sm text-primary-foreground/90">
              Review and act on reports. Showing page {page} of{" "}
              {totalPages} • {total.toLocaleString()} total.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-background/20 px-3 py-1 text-xs text-primary-foreground">
              Unresolved:{" "}
              <span className="font-semibold">
                {unresolved.toLocaleString()}
              </span>
            </span>
            <span className="rounded-full bg-background/20 px-3 py-1 text-xs text-primary-foreground">
              Page size:{" "}
              <span className="font-semibold">{PAGE_SIZE}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <form
        method="GET"
        className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-3 shadow-sm md:grid-cols-6"
        aria-label="Report filters"
      >
        <div className="md:col-span-2">
          <label htmlFor="mod-q" className="sr-only">
            Search reports
          </label>
          <input
            id="mod-q"
            name="q"
            defaultValue={parsed.q}
            placeholder="Search id/ip/user/details…"
            className="input w-full"
          />
        </div>
        <div>
          <label htmlFor="mod-type" className="sr-only">
            Listing type
          </label>
          <select
            id="mod-type"
            name="type"
            defaultValue={parsed.type || ""}
            className="select w-full"
          >
            <option value="">All types</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </div>
        <div>
          <label htmlFor="mod-reason" className="sr-only">
            Reason
          </label>
          <select
            id="mod-reason"
            name="reason"
            defaultValue={parsed.reason || ""}
            className="select w-full"
          >
            <option value="">All reasons</option>
            <option value="scam">Scam</option>
            <option value="prohibited">Prohibited</option>
            <option value="spam">Spam</option>
            <option value="wrong_category">Wrong category</option>
            <option value="counterfeit">Counterfeit</option>
            <option value="offensive">Offensive</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label htmlFor="mod-resolved" className="sr-only">
            Resolved state
          </label>
          <select
            id="mod-resolved"
            name="resolved"
            defaultValue={
              typeof parsed.resolved === "boolean"
                ? parsed.resolved
                  ? "1"
                  : "0"
                : ""
            }
            className="select w-full"
          >
            <option value="">All</option>
            <option value="0">Unresolved</option>
            <option value="1">Resolved</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-gradient-primary text-sm"
            aria-label="Apply filters"
          >
            Apply
          </button>
          <Link
            href="/admin/moderation"
            className="btn-outline text-sm"
            aria-label="Clear filters"
          >
            Clear
          </Link>
        </div>
      </form>

      {/* Results */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">Reports</h2>
          <div className="text-xs text-muted-foreground">
            {total.toLocaleString()} total • page {page}/{totalPages}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No reports match your filters.
          </div>
        ) : (
          <>
            <ModerationClient
              items={items.map((r: any) => ({
                id: String(r.id),
                listingId: String(r.listingId),
                listingType:
                  (r.listingType as "product" | "service") ?? "product",
                reason: String(r.reason ?? ""),
                details: (r.details ?? null) as string | null,
                ip: (r.ip ?? null) as string | null,
                userId: (r.userId ?? null) as string | null,
                createdAt:
                  r.createdAt instanceof Date
                    ? r.createdAt.toISOString()
                    : String(r.createdAt ?? ""),
                resolved: Boolean(r.resolved),
              }))}
              page={page}
              totalPages={totalPages}
              total={total}
            />

            {/* Pagination */}
            <nav
              className="flex items-center justify-between border-t border-border px-4 py-3 text-sm"
              aria-label="Pagination"
            >
              <Link
                href={
                  page > 1
                    ? keepQuery("/admin/moderation", parsed, {
                        page: page - 1,
                      })
                    : "#"
                }
                aria-disabled={page <= 1}
                className={`rounded border border-border px-3 py-1 text-sm transition ${
                  page > 1 ? "hover:shadow" : "opacity-50"
                }`}
              >
                ← Prev
              </Link>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(7, totalPages) }).map(
                  (_, i) => {
                    // center the window around current page when many pages
                    const half = 3;
                    let p = i + 1;
                    if (totalPages > 7) {
                      const start = Math.max(
                        1,
                        Math.min(page - half, totalPages - 6),
                      );
                      p = start + i;
                    }
                    const isCurrent = p === page;
                    return (
                      <Link
                        key={p}
                        href={keepQuery("/admin/moderation", parsed, {
                          page: p,
                        })}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`rounded px-2 py-1 text-sm ${
                          isCurrent
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
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
                  page < totalPages
                    ? keepQuery("/admin/moderation", parsed, {
                        page: page + 1,
                      })
                    : "#"
                }
                aria-disabled={page >= totalPages}
                className={`rounded border border-border px-3 py-1 text-sm transition ${
                  page < totalPages ? "hover:shadow" : "opacity-50"
                }`}
              >
                Next →
              </Link>
            </nav>
          </>
        )}
      </section>

      {/* Footer actions */}
      <div className="flex items-center justify-end">
        <Link
          href="/admin/dashboard"
          className="btn-outline text-sm"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
