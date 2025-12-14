// src/app/admin/requests/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import type { SearchParams15 } from "@/app/lib/next15";
import { requireAdmin } from "@/app/lib/authz";

type RequestRow = {
  id: string;
  kind: "product" | "service";
  title: string;
  description?: string | null;
  location?: string | null;
  category?: string | null;
  tags?: string[] | null;
  status: string;
  createdAt: string | null;
  expiresAt: string | null;
  boostUntil: string | null;
  ownerId?: string | null;
  contactEnabled?: boolean | null;
  contactMode?: string | null;
};

type Envelope<T> = {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
};

function getParam(sp: SearchParams15, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? (v[0] as string | undefined) : (v as string | undefined);
}

function toBool(v: string | undefined, fallback = false) {
  if (!v) return fallback;
  const s = v.toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function toNum(v: string | undefined, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function makeApiUrl(path: string) {
  const envBase =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["VERCEL_URL"];

  let base = envBase || "http://localhost:3000";
  if (!base.startsWith("http")) base = `https://${base}`;
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

function buildQS(sp: SearchParams15) {
  const qp = new URLSearchParams();
  const keys = ["q", "kind", "status", "category", "ownerId", "boosted", "includeExpired", "page", "pageSize"];
  for (const k of keys) {
    const v = getParam(sp, k);
    if (v != null && String(v).trim() !== "") qp.set(k, String(v));
  }
  return qp.toString();
}

function isBoosted(boostUntilIso: string | null) {
  if (!boostUntilIso) return false;
  const t = new Date(boostUntilIso).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function isExpired(expiresAtIso: string | null) {
  if (!expiresAtIso) return false;
  const t = new Date(expiresAtIso).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams15>;
}) {
  await requireAdmin();

  const sp = await searchParams;

  const q = (getParam(sp, "q") || "").trim();
  const kind = (getParam(sp, "kind") || "").trim().toLowerCase();
  const status = (getParam(sp, "status") || "").trim();
  const category = (getParam(sp, "category") || "").trim();
  const ownerId = (getParam(sp, "ownerId") || "").trim();
  const boosted = toBool(getParam(sp, "boosted"), false);
  const includeExpired = toBool(getParam(sp, "includeExpired"), true);

  const page = Math.max(1, toNum(getParam(sp, "page"), 1));
  const pageSize = Math.min(100, Math.max(1, toNum(getParam(sp, "pageSize"), 25)));

  const qs = buildQS(sp);
  const url = `${makeApiUrl("/api/admin/requests")}${qs ? `?${qs}` : ""}`;

  let env: Envelope<RequestRow> = {
    ok: true,
    page,
    pageSize,
    total: 0,
    totalPages: 1,
    items: [],
  };

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as any;
      env = {
        ok: Boolean(json?.ok),
        page: typeof json?.page === "number" ? json.page : page,
        pageSize: typeof json?.pageSize === "number" ? json.pageSize : pageSize,
        total: typeof json?.total === "number" ? json.total : 0,
        totalPages: typeof json?.totalPages === "number" ? json.totalPages : 1,
        items: Array.isArray(json?.items) ? (json.items as RequestRow[]) : [],
      };
    }
  } catch {
    // ignore
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Requests"
        subtitle="Admin directory of user requests."
        actions={
          <div className="flex gap-2">
            <Link href="/admin" prefetch={false} className="btn-outline text-sm">
              Back
            </Link>
          </div>
        }
      />

      <form
        method="GET"
        action="/admin/requests"
        className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-12"
      >
        <div className="md:col-span-5">
          <label className="block text-xs font-semibold text-muted-foreground">Search</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Title/description/tags..."
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-muted-foreground">Kind</label>
          <select
            name="kind"
            defaultValue={kind || ""}
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            <option value="">All</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-muted-foreground">Status</label>
          <input
            name="status"
            defaultValue={status}
            placeholder="ACTIVE/CLOSED..."
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-muted-foreground">Category</label>
          <input
            name="category"
            defaultValue={category}
            placeholder="Any"
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="md:col-span-4">
          <label className="block text-xs font-semibold text-muted-foreground">Owner ID</label>
          <input
            name="ownerId"
            defaultValue={ownerId}
            placeholder="cuid..."
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-muted-foreground">Boosted only</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="boosted"
              type="checkbox"
              name="boosted"
              value="1"
              defaultChecked={boosted}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="boosted" className="text-xs text-muted-foreground">
              Boosted
            </label>
          </div>
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-muted-foreground">Include expired</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="includeExpired"
              type="checkbox"
              name="includeExpired"
              value="1"
              defaultChecked={includeExpired}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="includeExpired" className="text-xs text-muted-foreground">
              Include expired
            </label>
          </div>
        </div>

        <input type="hidden" name="page" value={String(page)} />
        <input type="hidden" name="pageSize" value={String(pageSize)} />

        <div className="md:col-span-3 md:ml-auto md:flex md:items-end md:justify-end">
          <div className="flex gap-2">
            <button type="submit" className="btn-gradient-primary text-sm">
              Apply
            </button>
            <Link href="/admin/requests" prefetch={false} className="btn-outline text-sm">
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">Results</div>
          <div className="text-xs text-muted-foreground">
            Showing {env.total} request{env.total === 1 ? "" : "s"}
          </div>
        </div>

        {env.items.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No requests match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Kind</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-left">Boost</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {env.items.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground line-clamp-1">{r.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{r.location || "—"}</div>
                    </td>
                    <td className="px-4 py-3">{r.kind}</td>
                    <td className="px-4 py-3">{r.category || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs">
                        {r.status}
                      </span>
                      {isExpired(r.expiresAt) && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          Expired
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString("en-KE") : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.expiresAt ? new Date(r.expiresAt).toLocaleString("en-KE") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {isBoosted(r.boostUntil) ? (
                        <span className="inline-flex items-center rounded-full bg-[#161748] px-2 py-0.5 text-xs font-semibold text-white">
                          Boosted
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/requests/${encodeURIComponent(r.id)}`}
                        prefetch={false}
                        className="text-sm font-semibold text-brandBlue hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {env.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Page {env.page} of {env.totalPages}
          </div>
          <div className="flex gap-2">
            <Link
              prefetch={false}
              href={`/admin/requests?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(kind ? { kind } : {}),
                ...(status ? { status } : {}),
                ...(category ? { category } : {}),
                ...(ownerId ? { ownerId } : {}),
                ...(boosted ? { boosted: "1" } : {}),
                ...(includeExpired ? { includeExpired: "1" } : {}),
                page: String(Math.max(1, env.page - 1)),
                pageSize: String(env.pageSize),
              }).toString()}`}
              className="btn-outline text-sm"
              aria-disabled={env.page <= 1}
            >
              Prev
            </Link>
            <Link
              prefetch={false}
              href={`/admin/requests?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(kind ? { kind } : {}),
                ...(status ? { status } : {}),
                ...(category ? { category } : {}),
                ...(ownerId ? { ownerId } : {}),
                ...(boosted ? { boosted: "1" } : {}),
                ...(includeExpired ? { includeExpired: "1" } : {}),
                page: String(Math.min(env.totalPages, env.page + 1)),
                pageSize: String(env.pageSize),
              }).toString()}`}
              className="btn-outline text-sm"
              aria-disabled={env.page >= env.totalPages}
            >
              Next
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
