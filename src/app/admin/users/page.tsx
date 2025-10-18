export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import { getSessionUser } from "@/app/lib/auth";
import { isSuperAdminUser } from "@/app/lib/authz";
import RoleActions from "@/app/admin/users/RoleActions.client";

/* =========================
   Metadata (no indexing)
   ========================= */
export const metadata: Metadata = {
  title: "Users · QwikSale Admin",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

/* =========================
   Types & helpers
   ========================= */
type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  role: string | null; // "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN"
  createdAt: string | null; // ISO
};

type RoleFilter = "any" | "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";

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

/* ------------------------- search param helpers ------------------------- */
type SearchParams = Record<string, string | string[] | undefined>;
const getParam = (sp: SearchParams, k: string): string | undefined =>
  Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined);

const PAGE_SIZE = 50;

function keepQuery(
  base: string,
  sp: SearchParams,
  overrides: Partial<Record<"page" | "q" | "role", string>>
) {
  const url = new URL(base, "http://x");
  const qp = url.searchParams;

  const q = (getParam(sp, "q") || "").trim();
  const role = (getParam(sp, "role") || "").trim();
  const page = (getParam(sp, "page") || "").trim();

  if (q) qp.set("q", q);
  if (role) qp.set("role", role);
  if (page) qp.set("page", page);

  Object.entries(overrides).forEach(([k, v]) => {
    if (v == null || v === "") qp.delete(k);
    else qp.set(k, v);
  });

  const qs = qp.toString();
  return qs ? `${base}?${qs}` : base;
}

/* =========================
   Page (layout already gates admin)
   ========================= */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>; // Next 15
}) {
  const sp = await searchParams;

  const q = (getParam(sp, "q") || "").trim();
  const role = (getParam(sp, "role") || "any").toUpperCase() as RoleFilter;
  const page = Math.max(1, Number(getParam(sp, "page") || 1));

  // Who is the viewer?
  const viewer = await getSessionUser().catch(() => null);
  const viewerIsSuper = await isSuperAdminUser().catch(() => false);
  const viewerId = viewer?.id ?? null;

  // Build API query (backend may ignore unknown params; that's fine)
  const qs = new URLSearchParams();
  qs.set("limit", "500");
  if (q) qs.set("q", q);
  if (role !== "any") qs.set("role", role);

  let all: AdminUser[] | null = null;
  try {
    const res = await fetch(`/api/admin/users?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    all = (await res.json()) as AdminUser[];
  } catch {
    all = null;
  }

  if (!all) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400">
        Failed to load users.
      </div>
    );
  }

  // Client-side fallback filtering (in case API ignores q/role)
  const lowered = q.toLowerCase();
  let users = all.filter((u) => {
    const r = (u.role ?? "USER").toUpperCase();
    const roleOk = role === "any" ? true : r === role;
    const qOk =
      !lowered ||
      [u.id, u.email, u.name, u.username].some((x) => String(x ?? "").toLowerCase().includes(lowered));
    return roleOk && qOk;
  });

  const total = users.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = users.slice(start, end);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Admin · Users"
        subtitle={`Managing accounts and roles. Showing ${total.toLocaleString()}.`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin" className="btn-outline text-sm">Admin home</Link>
            <Link href="/admin/listings" className="btn-gradient-primary text-sm">Listings</Link>
          </div>
        }
      />

      {/* Filters */}
      <form
        method="GET"
        action="/admin/users"
        className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-8">
            <label className="label">Search</label>
            <input name="q" defaultValue={q} placeholder="ID, email, name, username…" className="input" />
          </div>
          <div className="md:col-span-4">
            <label className="label">Role</label>
            <select name="role" defaultValue={role} className="select">
              <option value="any">Any</option>
              <option value="USER">User</option>
              <option value="MODERATOR">Moderator</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPERADMIN">Super-admin</option>
            </select>
          </div>
          {/* always reset to first page on new query */}
          <input type="hidden" name="page" value="1" />
          <div className="md:col-span-12 flex items-end gap-2 pt-1">
            <button className="btn-gradient-primary">Apply</button>
            <Link href="/admin/users" className="btn-outline" prefetch={false}>
              Clear
            </Link>
          </div>
        </div>
      </form>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">All Users</h2>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            Total: {total.toLocaleString()} • Page {safePage} / {totalPages}
          </span>
        </div>

        {pageRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600 dark:text-slate-300">No users found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800/50 dark:text-slate-300">
                  <tr>
                    <Th>ID</Th>
                    <Th>Email</Th>
                    <Th>Name</Th>
                    <Th>Username</Th>
                    <Th>Role</Th>
                    <Th>Created</Th>
                    {viewerIsSuper && <Th>Actions</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-slate-800">
                  {pageRows.map((u) => {
                    const r = (u.role ?? "USER").toUpperCase();
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                        <Td className="font-mono text-xs">{u.id}</Td>
                        <Td>{u.email ?? "—"}</Td>
                        <Td>{u.name ?? "—"}</Td>
                        <Td>
                          {u.username ? (
                            <Link href={`/store/${u.username}`} className="underline text-[#161748] dark:text-[#39a0ca]">
                              @{u.username}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>
                          <Badge
                            tone={
                              r === "SUPERADMIN"
                                ? "indigo"
                                : r === "ADMIN"
                                ? "green"
                                : r === "MODERATOR"
                                ? "amber"
                                : "slate"
                            }
                          >
                            {r}
                          </Badge>
                        </Td>
                        <Td>{fmtDateKE(u.createdAt)}</Td>
                        {viewerIsSuper && (
                          <Td>
                            <RoleActions
                              userId={u.id}
                              currentRole={r as "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN"}
                              isSelf={viewerId === u.id}
                            />
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <nav
              className="flex items-center justify-between border-t px-4 py-3 text-sm dark:border-slate-800"
              aria-label="Pagination"
            >
              <Link
                href={safePage > 1 ? keepQuery("/admin/users", sp, { page: String(safePage - 1) }) : "#"}
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
                      href={keepQuery("/admin/users", sp, { page: String(p) })}
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
                  safePage < totalPages ? keepQuery("/admin/users", sp, { page: String(safePage + 1) }) : "#"
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

/* =========================
   Tiny presentational bits
   ========================= */
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}
