// src/app/admin/users/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import type { JSX, ReactNode } from "react";
import SectionHeader from "@/app/components/SectionHeader";
import { getSessionUser, isSuperAdminUser } from "@/app/lib/authz";
import { prisma } from "@/app/lib/prisma";

export const metadata: Metadata = {
  title: "Users · QwikSale Admin",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  role: string | null;
  createdAt: string | null;
};

type RoleFilter = "any" | "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";

const SSR_TIMEOUT_MS = 1200;
const FETCH_TIMEOUT_MS = 2500;
const PAGE_SIZE = 50;
const API_LIMIT = 500;

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
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
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

const getParam = (sp: SearchParams, k: string): string | undefined =>
  Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined);

function keepQuery(
  base: string,
  sp: SearchParams,
  overrides: Partial<Record<"page" | "q" | "role", string>>,
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

function parseRoleFilter(raw: string | undefined): RoleFilter {
  if (!raw) return "any";
  const upper = raw.toUpperCase();
  if (
    upper === "USER" ||
    upper === "MODERATOR" ||
    upper === "ADMIN" ||
    upper === "SUPERADMIN"
  ) {
    return upper as Exclude<RoleFilter, "any">;
  }
  return "any";
}

// Accept various API payload shapes: array, {users:[]}, {data:[]}, {items:[]}, {rows:[]}
function normalizeUsersPayload(payload: unknown): AdminUser[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload as AdminUser[];
  }
  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const keys = ["users", "data", "items", "rows"];
    for (const key of keys) {
      const maybe = obj[key];
      if (Array.isArray(maybe)) {
        return maybe as AdminUser[];
      }
    }
  }
  return [];
}

// Fallback: direct Prisma query if the API fails or returns 0 rows.
// Uses the same basic filters as /api/admin/users.
async function fetchUsersFallback(opts: {
  q: string;
  role: RoleFilter;
  limit: number;
}): Promise<AdminUser[]> {
  const { q, role, limit } = opts;

  const where: Record<string, unknown> = {};
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    const or: any[] = [{ email: like }, { name: like }, { username: like }];
    if (q.length >= 8) {
      or.push({ id: q });
    }
    where["OR"] = or;
  }
  if (role !== "any") {
    where["role"] = role;
  }

  const rows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });

  return rows.map((u) => ({
    id: String(u.id),
    email: u.email ?? null,
    name: u.name ?? null,
    username: u.username ?? null,
    role: u.role ? String(u.role) : null,
    createdAt:
      u.createdAt instanceof Date
        ? u.createdAt.toISOString()
        : ((u as any).createdAt as string | null) ?? null,
  }));
}

/**
 * Admin-only view.
 * Access enforced by:
 * - /admin/layout via requireAdmin()
 * - middleware / assertAdmin for /api/admin/users
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const q = (getParam(sp, "q") || "").trim();
  const role = parseRoleFilter(getParam(sp, "role") || "any");
  const page = Math.max(1, Number(getParam(sp, "page") || 1));

  const [viewer, viewerIsSuper] = await Promise.all([
    withTimeout(getSessionUser().catch(() => null), SSR_TIMEOUT_MS, null),
    withTimeout(isSuperAdminUser().catch(() => false), SSR_TIMEOUT_MS, false),
  ]);

  const viewerId = viewer?.id ?? null;

  const qs = new URLSearchParams();
  qs.set("limit", String(API_LIMIT));
  if (q) qs.set("q", q);
  if (role !== "any") qs.set("role", role);

  let all: AdminUser[] | null = null;
  let lastStatus = 0;
  let hadApiError = false;

  try {
    const res = await fetchWithTimeout(
      `/api/admin/users?${qs.toString()}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
      FETCH_TIMEOUT_MS,
    );
    lastStatus = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await withTimeout(res.json(), 800, []);
    all = normalizeUsersPayload(json);
  } catch {
    all = null;
    hadApiError = true;
  }

  let source: AdminUser[] = Array.isArray(all) ? all : [];
  let hadFallbackError = false;

  if (source.length === 0) {
    try {
      source = await fetchUsersFallback({
        q,
        role,
        limit: API_LIMIT,
      });
    } catch {
      hadFallbackError = true;
    }
  }

  const softError =
    hadApiError && hadFallbackError
      ? lastStatus === 403
        ? "You need admin access to view users."
        : "Failed to load users. Showing an empty list."
      : null;

  const lowered = q.toLowerCase();

  const users: AdminUser[] = source.filter((u) => {
    const r = (u.role ?? "USER").toUpperCase().trim();
    const roleOk = role === "any" ? true : r === role;
    const qOk =
      !lowered ||
      [u.id, u.email, u.name, u.username].some((x) =>
        String(x ?? "").toLowerCase().includes(lowered),
      );
    return roleOk && qOk;
  });

  const total = users.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = users.slice(start, end);

  let RoleActions: (props: {
    userId: string;
    currentRole: "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";
    isSelf: boolean;
  }) => JSX.Element | null = () => null;

  if (viewerIsSuper) {
    try {
      const mod = await import("@/app/admin/users/RoleActions.client");
      RoleActions = (mod.default as typeof RoleActions) ?? (() => null);
    } catch {
      RoleActions = () => null;
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h2"
        title="Admin · Users"
        subtitle={`Managing accounts and roles. Showing ${total.toLocaleString()}.`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin" className="btn-outline text-sm" prefetch={false}>
              Admin home
            </Link>
            <Link
              href="/admin/listings"
              className="btn-gradient-primary text-sm"
              prefetch={false}
            >
              Listings
            </Link>
          </div>
        }
      />

      <h1 className="text-2xl font-bold">All Users</h1>

      {softError && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {softError}
        </div>
      )}

      {/* Filters */}
      <form
        method="GET"
        action="/admin/users"
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-8">
            <label className="label">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="ID, email, name, username…"
              className="input"
            />
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
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">Users</h2>
          <span className="text-xs text-muted-foreground">
            Total: {total.toLocaleString()} • Page {safePage} / {totalPages}
          </span>
        </div>

        {pageRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No users found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">
                  Admin user list with roles, created date, and actions
                </caption>
                <thead className="bg-muted text-muted-foreground">
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
                <tbody className="divide-y divide-border">
                  {pageRows.map((u) => {
                    const r = (u.role ?? "USER").toUpperCase().trim() as
                      | "USER"
                      | "MODERATOR"
                      | "ADMIN"
                      | "SUPERADMIN";

                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-muted"
                      >
                        <Td className="font-mono text-xs">{u.id}</Td>
                        <Td>{u.email ?? "—"}</Td>
                        <Td>{u.name ?? "—"}</Td>
                        <Td>
                          {u.username ? (
                            <Link
                              href={`/store/${u.username}`}
                              prefetch={false}
                              className="underline text-[#161748] dark:text-[#39a0ca]"
                            >
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
                        {viewerIsSuper ? (
                          <Td>
                            <RoleActions
                              userId={u.id}
                              currentRole={r}
                              isSelf={viewerId === u.id}
                            />
                          </Td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <nav
              className="flex items-center justify-between border-t border-border px-4 py-3 text-sm"
              aria-label="Pagination"
            >
              <Link
                href={
                  safePage > 1
                    ? keepQuery("/admin/users", sp, {
                        page: String(safePage - 1),
                      })
                    : "#"
                }
                aria-disabled={safePage <= 1}
                className={`rounded border border-border px-3 py-1 transition ${
                  safePage > 1 ? "hover:shadow" : "opacity-50"
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
                        href={keepQuery("/admin/users", sp, {
                          page: String(p),
                        })}
                        prefetch={false}
                        aria-current={isCurrent ? "page" : undefined}
                        className={`rounded px-2 py-1 ${
                          isCurrent
                            ? "bg-[#161748] text-primary-foreground"
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
                  safePage < totalPages
                    ? keepQuery("/admin/users", sp, {
                        page: String(safePage + 1),
                      })
                    : "#"
                }
                aria-disabled={safePage >= totalPages}
                className={`rounded border border-border px-3 py-1 transition ${
                  safePage < totalPages ? "hover:shadow" : "opacity-50"
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

function Th({ children }: { children: ReactNode }) {
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
  children: ReactNode;
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
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "indigo";
}) {
  const map: Record<string, string> = {
    slate: "bg-muted text-muted-foreground",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
    indigo: "bg-indigo-100 text-indigo-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[tone]}`}
    >
      {children}
    </span>
  );
}
