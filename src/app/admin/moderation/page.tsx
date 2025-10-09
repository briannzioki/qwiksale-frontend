// src/app/admin/moderation/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return db.report.count(where ? { where } : undefined);
  }
  return 0;
}

async function safeReportFindMany(args: any): Promise<any[]> {
  if (db.report?.findMany) {
    return db.report.findMany(args);
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
  const type = sp.type === "product" || sp.type === "service" ? sp.type : undefined;
  const reason = (sp.reason || "").trim();
  const resolved = sp.resolved === "1" ? true : sp.resolved === "0" ? false : undefined;
  return { page, q, type, reason, resolved };
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

  const total = await safeReportCount(where);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const items = await safeReportFindMany({
    where,
    orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return { items, total, totalPages, page: safePage };
}

/* --------------------------------- Page --------------------------------- */
export default async function ModerationPage({
  searchParams,
}: {
  // Next 15 passes a Promise here
  searchParams: Promise<SearchParams>;
}) {
  // Admin layout already gates access server-side.
  const raw = await searchParams;
  const parsed = parseParams(raw);

  const { items, total, totalPages, page } = await loadReports(parsed);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Moderation</h1>
        <p className="mt-1 text-sm text-white/90">
          Review and act on reports. Showing page {page} of {totalPages} • {total.toLocaleString()} total.
        </p>
      </div>

      {/* Filters */}
      <form
        method="GET"
        className="grid grid-cols-1 gap-2 rounded-xl border bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-6"
      >
        <input
          name="q"
          defaultValue={parsed.q}
          placeholder="Search id/ip/user/details…"
          className="md:col-span-2 rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
        />
        <select
          name="type"
          defaultValue={parsed.type || ""}
          className="rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
        >
          <option value="">All types</option>
          <option value="product">Product</option>
          <option value="service">Service</option>
        </select>
        <select
          name="reason"
          defaultValue={parsed.reason || ""}
          className="rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
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
        <select
          name="resolved"
          defaultValue={
            typeof parsed.resolved === "boolean" ? (parsed.resolved ? "1" : "0") : ""
          }
          className="rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
        >
          <option value="">All</option>
          <option value="0">Unresolved</option>
          <option value="1">Resolved</option>
        </select>
        <button className="rounded bg-[#161748] px-3 py-1 text-sm text-white">Apply</button>
        <Link href="/admin/moderation" className="btn-outline px-2 py-1 text-sm">
          Clear
        </Link>
      </form>

      {/* Client-only bulk actions + table actions */}
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">Reports</h2>
        </div>

        <ModerationClient
          items={items.map((r: any) => ({
            id: String(r.id),
            listingId: String(r.listingId),
            listingType: (r.listingType as "product" | "service") ?? "product",
            reason: String(r.reason ?? ""),
            details: (r.details ?? null) as string | null,
            ip: (r.ip ?? null) as string | null,
            userId: (r.userId ?? null) as string | null,
            createdAt:
              r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
            resolved: Boolean(r.resolved),
          }))}
          page={page}
          totalPages={totalPages}
          total={total}
        />
      </section>

      {/* Footer actions */}
      <div className="flex items-center justify-end">
        <Link
          href="/admin/dashboard"
          className="rounded-xl border px-3 py-1 text-sm shadow-sm transition hover:shadow dark:border-slate-800"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
