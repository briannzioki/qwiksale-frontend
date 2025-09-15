// src/app/admin/moderation/page.tsx
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import ModerationClient from "@/app/admin/moderation/ModerationClient.client";

/* ---------------------- prisma alias for new models ---------------------- */
const db = prisma as unknown as typeof prisma & {
  report: {
    count: (args: any) => Promise<number>;
    findMany: (args: any) => Promise<any[]>;
  };
};

export const dynamic = "force-dynamic";

/* --------------------------------- RBAC --------------------------------- */
async function requireAdmin() {
  const session = await auth().catch(() => null);
  const email = (session?.user as any)?.email as string | undefined;
  const allow = (process.env["ADMIN_EMAILS"] || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allow.includes(email.toLowerCase())) {
    notFound();
  }
  return session!;
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
  const resolved =
    sp.resolved === "1" ? true : sp.resolved === "0" ? false : undefined;

  return { page, q, type, reason, resolved };
}

async function loadReports({ page, q, type, reason, resolved }: ReturnType<typeof parseParams>) {
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

  const total = await db.report.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const items = await db.report.findMany({
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
  // 👇 Next 15 expects Promise here
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  // 👇 resolve the promise
  const raw = await searchParams;
  const parsed = parseParams(raw);

  const { items, total, totalPages, page } = await loadReports(parsed);

  return (
    <div className="container-page py-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Moderation</h1>
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Review and act on user reports.
          </p>
        </div>
        <Link href="/dashboard" className="btn-outline">Back</Link>
      </header>

      {/* Filters */}
      <form className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-xl border bg-white p-3 dark:bg-slate-900 dark:border-slate-800">
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
        <button className="rounded bg-[#161748] text-white px-3 py-1 text-sm">
          Apply
        </button>
        <Link href="/admin/moderation" className="btn-outline text-sm px-2 py-1">
          Clear
        </Link>
      </form>

      {/* Client-only bulk actions + table actions */}
      <ModerationClient
        items={items.map((r: any) => ({
          id: r.id as string,
          listingId: r.listingId as string,
          listingType: r.listingType as "product" | "service",
          reason: r.reason as string,
          details: (r.details ?? null) as string | null,
          ip: (r.ip ?? null) as string | null,
          userId: (r.userId ?? null) as string | null,
          createdAt:
            (r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt) as
              | string
              | Date,
          resolved: Boolean(r.resolved),
        }))}
        page={page}
        totalPages={totalPages}
        total={total}
      />
    </div>
  );
}
