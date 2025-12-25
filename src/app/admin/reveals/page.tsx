// src/app/admin/reveals/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { prisma } from "@/app/lib/prisma";

export const metadata: Metadata = {
  title: "Contact Reveals · QwikSale",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

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

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  const t = new Promise<T>((resolve) => {
    tid = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.catch(() => fallback), t]).finally(() => {
    if (tid) clearTimeout(tid);
  }) as Promise<T>;
}

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

export default async function AdminRevealsPage({
  searchParams,
}: {
  searchParams: Promise<SafeSearchParams>;
}) {
  // Admin gate enforced once in /admin/layout.
  const sp = (await searchParams) ?? {};
  const qRaw = (getStr(sp, "q") || "").trim();
  const q = qRaw.length > 120 ? qRaw.slice(0, 120) : qRaw;

  const takeStr = getStr(sp, "take");
  const takeNum = clamp(
    Number.isFinite(Number(takeStr)) ? Number(takeStr) : 200,
    20,
    1000,
  );

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

  let logs: RevealWithProduct[] = [];
  let loadError = "";
  try {
    logs = await withTimeout(
      prisma.contactReveal
        .findMany({
          ...(where ? { where } : {}),
          orderBy: { createdAt: "desc" },
          take: takeNum,
          include: { product: { select: { id: true, name: true } } },
        })
        .catch((e: unknown) => {
          console.error("[admin/reveals] prisma error:", e);
          loadError = "Failed to load reveal logs. Please try again.";
          return [] as RevealWithProduct[];
        }),
      1200,
      [],
    );
  } catch {
    logs = [];
  }

  const header: string[] = [
    "createdAt(UTC)",
    "productId",
    "productName",
    "viewerUserId",
    "ip",
    "userAgent",
  ];
  const csvRows: string[][] = [
    header,
    ...logs.map((r) => [
      (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
      r.productId,
      r.product?.name ?? "",
      r.viewerUserId ?? "",
      r.ip ?? "",
      r.userAgent ?? "",
    ]),
  ];
  const csv = toCsv(csvRows);
  const csvHref = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);

  const inputClass =
    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const selectClass =
    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const actionBtnClass =
    "inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const heroActionBtnClass =
    "inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)]/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--bg)]/15 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  return (
    <div className="container-page space-y-4 py-6 text-[var(--text)]">
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] px-6 py-8 text-white shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Contact Reveals
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Search, review, and export reveal logs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={csvHref}
              download={`contact-reveals-${stamp}.csv`}
              className={heroActionBtnClass}
              aria-label="Export reveals as CSV"
            >
              Export CSV
            </a>
            <Link
              href="/admin/reveals"
              className={heroActionBtnClass}
              aria-label="Refresh page"
            >
              Refresh
            </Link>
          </div>
        </div>
      </div>

      <form
        className="flex flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:flex-row"
        aria-label="Filter reveals"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search product name, product id, user id, IP, User-Agent…"
          className={`${inputClass} flex-1`}
          aria-label="Search reveals"
        />
        <select
          name="take"
          defaultValue={String(takeNum)}
          className={selectClass}
          aria-label="Number to show"
        >
          {TAKE_CHOICES.map((n) => (
            <option key={n} value={n}>
              Show {n}
            </option>
          ))}
        </select>
        <button className={actionBtnClass} aria-label="Apply filters">
          Apply
        </button>
      </form>

      {loadError ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text)]">
          {loadError}
        </div>
      ) : null}

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)] shadow-soft">
          No reveal logs found{q ? ` for “${q}”` : ""}.
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <Th>Time (UTC)</Th>
                <Th>Product</Th>
                <Th>Viewer</Th>
                <Th>IP</Th>
                <Th>User Agent</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {logs.map((r) => {
                const created =
                  r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
                return (
                  <tr key={r.id} className="hover:bg-[var(--bg-subtle)]">
                    <Td className="whitespace-nowrap text-[var(--text-muted)]">
                      <time dateTime={created.toISOString()}>
                        {fmtUTC.format(created)}
                      </time>
                    </Td>

                    <Td>
                      <Link
                        className="rounded underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 ring-focus"
                        href={`/product/${r.productId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open product ${r.productId}`}
                      >
                        {r.product?.name ?? r.productId}
                      </Link>
                    </Td>

                    <Td className="text-[var(--text-muted)]">
                      {r.viewerUserId ? (
                        r.viewerUserId
                      ) : (
                        <span className="text-[var(--text-muted)]">guest</span>
                      )}
                    </Td>

                    <Td className="text-[var(--text-muted)]">
                      {r.ip || <span className="text-[var(--text-muted)]">-</span>}
                    </Td>

                    <Td className="max-w-[420px]">
                      <span className="line-clamp-2 break-all text-[var(--text)]">
                        {r.userAgent || "-"}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        Showing {logs.length} of latest reveals{q ? ` filtered by “${q}”` : ""}.
        Data is uncached and rendered on the server.
      </p>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2">{children}</th>;
}
function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>;
}
