// src/app/admin/reveals/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { env } from "@/app/lib/env";

function allow(em?: string | null) {
  const list = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return false;
  return !!em && list.includes(em.toLowerCase());
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// Safe read helper for Next 15 async searchParams
function getStr(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

export default async function AdminRevealsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!allow(session?.user?.email ?? null)) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-gray-700">
        <h1 className="text-lg font-semibold mb-2">Not authorized</h1>
        <p>
          Your account isn’t on the admin list. If you think this is an error,
          add your email to <code>ADMIN_EMAILS</code> and redeploy.
        </p>
        <div className="mt-4">
          <Link href="/" className="text-[#39a0ca] underline">
            ← Back to site
          </Link>
        </div>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};
  const qRaw = (getStr(sp, "q") || "").trim();
  const q = qRaw.length > 120 ? qRaw.slice(0, 120) : qRaw;

  const takeStr = getStr(sp, "take");
  const takeNum = clamp(
    Number.isFinite(Number(takeStr)) ? Number(takeStr) : 200,
    20,
    1000
  );

  // Build filter without importing Prisma types (keeps TS happy across versions)
  const where =
    q.length > 0
      ? {
          OR: [
            {
              product: {
                is: {
                  name: { contains: q, mode: "insensitive" as any },
                },
              },
            },
            { productId: q },
            { viewerUserId: { contains: q } },
            { ip: { contains: q } },
            { userAgent: { contains: q } },
          ],
        }
      : undefined;

  const logs = await prisma.contactReveal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: takeNum,
    include: { product: { select: { id: true, name: true } } },
  });

  type LogRow = (typeof logs)[number];

  // CSV
  const csvHeader = [
    "createdAt",
    "productId",
    "productName",
    "viewerUserId",
    "ip",
    "userAgent",
  ] as const;

  const csvRows = logs.map((r: LogRow) => [
    r.createdAt.toISOString(),
    r.productId,
    (r.product?.name ?? "").replaceAll('"', '""'),
    r.viewerUserId ?? "",
    r.ip ?? "",
    (r.userAgent ?? "").replaceAll('"', '""'),
  ]);

  const csv = [csvHeader, ...csvRows]
    .map((cols) => cols.map((c: string) => `"${c}"`).join(","))
    .join("\n");

  const csvHref = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Contact Reveals</h1>
        <div className="flex items-center gap-2">
          <a
            href={csvHref}
            download={`contact-reveals-${new Date()
              .toISOString()
              .slice(0, 19)}.csv`}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Export CSV
          </a>
          <Link
            href="/admin/reveals"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Refresh
          </Link>
        </div>
      </div>

      {/* Search / controls */}
      <form className="mb-4 flex flex-col sm:flex-row gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search product, id, user id, IP, UA…"
          className="flex-1 rounded-lg border px-3 py-2"
        />
        <select
          name="take"
          defaultValue={String(takeNum)}
          className="rounded-lg border px-3 py-2"
        >
          {[50, 100, 200, 500, 1000].map((n) => (
            <option key={n} value={n}>
              Show {n}
            </option>
          ))}
        </select>
        <button className="rounded-lg border px-3 py-2 hover:bg-gray-50">
          Apply
        </button>
      </form>

      {logs.length === 0 ? (
        <div className="text-sm text-gray-600 border rounded-xl p-4">
          No reveal logs found{q ? ` for “${q}”` : ""}.
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b bg-slate-50">
                <th className="py-2 px-3">Time (UTC)</th>
                <th className="py-2 px-3">Product</th>
                <th className="py-2 px-3">Viewer</th>
                <th className="py-2 px-3">IP</th>
                <th className="py-2 px-3">User Agent</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((r: LogRow) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 px-3 whitespace-nowrap">
                    <time dateTime={r.createdAt.toISOString()}>
                      {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </time>
                  </td>
                  <td className="py-2 px-3">
                    <a
                      className="underline"
                      href={`/product/${r.productId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.product?.name ?? r.productId}
                    </a>
                  </td>
                  <td className="py-2 px-3">
                    {r.viewerUserId ? (
                      r.viewerUserId
                    ) : (
                      <span className="text-gray-500">guest</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {r.ip ? <>{r.ip}</> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2 px-3 max-w-[420px]">
                    <span className="line-clamp-2 break-all text-gray-700">
                      {r.userAgent || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Showing {logs.length} of latest reveals
        {q ? ` filtered by “${q}”` : ""}. Data is uncached and rendered on the server.
      </p>
    </div>
  );
}
