// src/app/admin/reveals/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { env } from "@/app/lib/env";
import type { Prisma } from "@prisma/client";

/* ---------- auth ---------- */
function allow(em?: string | null) {
  const list = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return false;
  return !!em && list.includes(em.toLowerCase());
}

/* ---------- helpers ---------- */
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
type SafeSearchParams = Record<string, string | string[] | undefined>;
function getStr(sp: SafeSearchParams, key: string): string | undefined {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

// Minimal CSV quoting; add BOM for Excel
function toCsv(rows: string[][]): string {
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const body = rows.map((r) => r.map(quote).join(",")).join("\n");
  return "\uFEFF" + body;
}

const fmtUTC = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  dateStyle: "short",
  timeStyle: "medium",
});

type RevealWithProduct = Prisma.ContactRevealGetPayload<{
  include: { product: { select: { id: true; name: true } } };
}>;
const TAKE_CHOICES = [50, 100, 200, 500, 1000] as const;

/* ---------- page ---------- */
export default async function AdminRevealsPage({
  searchParams,
}: {
  // Next 15: when present, searchParams is a Promise
  searchParams?: Promise<SafeSearchParams>;
}) {
  const session = await auth().catch(() => null);
  if (!allow(session?.user?.email ?? null)) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-gray-700">
        <h1 className="mb-2 text-lg font-semibold">Not authorized</h1>
        <p>
          Your account isn’t on the admin list. Add your email to{" "}
          <code>ADMIN_EMAILS</code> (comma-separated) and redeploy.
        </p>
        <div className="mt-4">
          <Link href="/" className="text-[#39a0ca] underline">
            ← Back to site
          </Link>
        </div>
      </div>
    );
  }

  // Resolve promised search params (awaiting a non-promise is fine in JS)
  const sp: SafeSearchParams = (await searchParams) ?? {};
  const qRaw = (getStr(sp, "q") || "").trim();
  const q = qRaw.length > 120 ? qRaw.slice(0, 120) : qRaw;

  const takeStr = getStr(sp, "take");
  const takeNum = clamp(Number.isFinite(Number(takeStr)) ? Number(takeStr) : 200, 20, 1000);

  let where: Prisma.ContactRevealWhereInput | undefined;
  if (q.length > 0) {
    where = {
      OR: [
        { product: { is: { name: { contains: q, mode: "insensitive" } } } },
        { productId: q },
        { viewerUserId: { contains: q } },
        { ip: { contains: q } },
        { userAgent: { contains: q } },
      ],
    };
  }

  // Load logs (graceful failure => empty list + banner)
  let logs: RevealWithProduct[] = [];
  let loadError = "";
  try {
    logs = (await prisma.contactReveal.findMany({
      ...(where ? { where } : {}),
      orderBy: { createdAt: "desc" },
      take: takeNum,
      include: { product: { select: { id: true, name: true } } },
    })) as RevealWithProduct[];
  } catch (e) {
    console.error("[admin/reveals] prisma error:", e);
    loadError = "Failed to load reveal logs. Please try again.";
  }

  const header = ["createdAt(UTC)", "productId", "productName", "viewerUserId", "ip", "userAgent"] as const;
  const csvRows: string[][] = [
    header as unknown as string[],
    ...logs.map((r) => [
      r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      r.productId,
      r.product?.name ?? "",
      r.viewerUserId ?? "",
      r.ip ?? "",
      r.userAgent ?? "",
    ]),
  ];
  const csv = toCsv(csvRows);
  const csvHref = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">Contact Reveals</h1>
        <div className="flex items-center gap-2">
          <a
            href={csvHref}
            download={`contact-reveals-${new Date().toISOString().slice(0, 19)}.csv`}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            Export CSV
          </a>
          <Link
            href="/admin/reveals"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            Refresh
          </Link>
        </div>
      </div>

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search product, id, user id, IP, UA…"
          className="flex-1 rounded-lg border px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
          aria-label="Search reveals"
        />
        <select
          name="take"
          defaultValue={String(takeNum)}
          className="rounded-lg border px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
          aria-label="Number to show"
        >
          {TAKE_CHOICES.map((n) => (
            <option key={n} value={n}>
              Show {n}
            </option>
          ))}
        </select>
        <button className="rounded-lg border px-3 py-2 hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-800">
          Apply
        </button>
      </form>

      {loadError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {loadError}
        </div>
      ) : null}

      {logs.length === 0 ? (
        <div className="rounded-xl border p-4 text-sm text-gray-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          No reveal logs found{q ? ` for “${q}”` : ""}.
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left dark:border-slate-800 dark:bg-slate-800/40">
                <Th>Time (UTC)</Th>
                <Th>Product</Th>
                <Th>Viewer</Th>
                <Th>IP</Th>
                <Th>User Agent</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((r) => (
                <tr key={r.id} className="border-b last:border-0 dark:border-slate-800">
                  <Td className="whitespace-nowrap">
                    <time dateTime={new Date(r.createdAt).toISOString()}>
                      {fmtUTC.format(new Date(r.createdAt))}
                    </time>
                  </Td>
                  <Td>
                    <a className="underline" href={`/product/${r.productId}`} target="_blank" rel="noopener noreferrer">
                      {r.product?.name ?? r.productId}
                    </a>
                  </Td>
                  <Td>{r.viewerUserId ? r.viewerUserId : <span className="text-gray-500">guest</span>}</Td>
                  <Td>{r.ip || <span className="text-gray-400">—</span>}</Td>
                  <Td className="max-w-[420px]">
                    <span className="line-clamp-2 break-all text-gray-700 dark:text-slate-200">
                      {r.userAgent || "—"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
        Showing {logs.length} of latest reveals{q ? ` filtered by “${q}”` : ""}. Data is uncached and rendered on the
        server.
      </p>
    </div>
  );
}

/* small bits */
function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 px-3">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2 px-3 ${className ?? ""}`}>{children}</td>;
}
