// src/app/admin/users/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import type { JSX, ReactNode } from "react";
import { revalidatePath } from "next/cache";
import SectionHeader from "@/app/components/SectionHeader";
import { getSessionUser, isSuperAdminUser, requireAdmin } from "@/app/lib/authz";
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
  verified: boolean | null;
  suspended: boolean | null;
  banned: boolean | null;
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
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
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

  const db = prisma as any;

  // Try a “wide” select first; if schema drift exists, fall back to a “narrow” select.
  let rows: any[] = [];
  try {
    rows = await db.user.findMany({
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
        verified: true,
        suspended: true,
        banned: true,
      },
    });
  } catch {
    rows = await db.user.findMany({
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
  }

  return rows.map((u: any) => ({
    id: String(u.id),
    email: u.email ?? null,
    name: u.name ?? null,
    username: u.username ?? null,
    role: u.role ? String(u.role) : null,
    createdAt:
      u.createdAt instanceof Date
        ? u.createdAt.toISOString()
        : (u.createdAt as string | null) ?? null,
    verified: typeof u.verified === "boolean" ? u.verified : null,
    suspended: typeof u.suspended === "boolean" ? u.suspended : null,
    banned: typeof u.banned === "boolean" ? u.banned : null,
  }));
}

/* ----------------------------
   Server actions: enforcement
   ---------------------------- */
async function setUserEnforcementFlag(formData: FormData) {
  "use server";

  const gate = await requireAdmin({
    mode: "result",
    callbackUrl: "/admin/users",
    adminFallbackHref: "/dashboard",
  });

  if (!gate || (gate as any).authorized !== true) {
    throw new Error("Unauthorized");
  }

  const viewerId = String((gate as any)?.user?.id ?? "");
  const userId = String(formData.get("userId") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim().toLowerCase();
  const valueRaw = String(formData.get("value") ?? "").trim().toLowerCase();

  if (!userId) throw new Error("Missing userId");
  if (field !== "banned" && field !== "suspended") {
    throw new Error("Invalid enforcement field");
  }

  const next =
    valueRaw === "1" ||
    valueRaw === "true" ||
    valueRaw === "yes" ||
    valueRaw === "on";

  // Safety: don’t let an admin lock themselves out via UI.
  if (viewerId && viewerId === userId && next) {
    throw new Error("Refusing to update your own enforcement flags.");
  }

  const db = prisma as any;
  try {
    await db.user.update({
      where: { id: userId },
      data: { [field]: next },
      select: { id: true },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[admin/users] setUserEnforcementFlag failed:", e);
    throw new Error("Failed to update user.");
  }

  revalidatePath("/admin/users");
}

/**
 * Admin-only view.
 * Access enforced by:
 * - /admin/layout via requireAdmin()
 * - middleware / assertAdmin for /api/admin/users
 */
const SectionHeaderAny = SectionHeader as any;

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
  const verifiedCount = users.filter((u) => !!u.verified).length;
  const suspendedCount = users.filter((u) => !!u.suspended).length;
  const bannedCount = users.filter((u) => !!u.banned).length;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRows = users.slice(start, end);

  let RoleActions: (props: {
    userId: string;
    currentRole: "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN";
    isSelf: boolean;
    verified: boolean;
    suspended: boolean;
    banned: boolean;
  }) => JSX.Element | null = () => null;

  if (viewerIsSuper) {
    try {
      const mod = await import("@/app/admin/users/RoleActions.client");
      RoleActions = (mod.default as typeof RoleActions) ?? (() => null);
    } catch {
      RoleActions = () => null;
    }
  }

  const actionBtnClass =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold border border-[var(--border-subtle)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const actionBtnElevatedClass =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const labelClass = "text-xs font-semibold text-[var(--text-muted)]";
  const inputClass =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const selectClass =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const pagerBtnClass = (enabled: boolean) =>
    [
      "inline-flex items-center justify-center rounded-xl px-3 py-1.5 font-semibold",
      "border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
      "transition focus-visible:outline-none focus-visible:ring-2 ring-focus",
      enabled ? "hover:bg-[var(--bg-subtle)] active:scale-[.99]" : "opacity-50",
    ].join(" ");

  const pageNumClass = (current: boolean) =>
    [
      "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-xl px-2",
      "text-sm font-semibold border transition",
      current
        ? "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]"
        : "border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
      "active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
    ].join(" ");

  const enforcementBtnClass = (tone: "neutral" | "strong") =>
    [
      "inline-flex items-center justify-center rounded-lg px-2 py-1",
      "text-[11px] font-semibold",
      "border transition",
      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
      "active:scale-[.99] disabled:opacity-60",
      tone === "strong"
        ? "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]"
        : "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-subtle)]",
    ].join(" ");

  return (
    <div className="space-y-6 text-[var(--text)]">
      <SectionHeaderAny
        as="h2"
        title="Admin · Users"
        subtitle={`Manage roles, verification and enforcement. Showing ${total.toLocaleString()} users.`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin" className={actionBtnClass} prefetch={false}>
              Admin home
            </Link>
            <Link
              href="/admin/listings"
              className={actionBtnElevatedClass}
              prefetch={false}
            >
              Listings
            </Link>
            <Link
              href="/admin/moderation"
              className={actionBtnClass}
              prefetch={false}
            >
              Moderation
            </Link>
          </div>
        }
      />

      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
        All Users
      </h1>

      {/* Quick stats */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatPill label="Total" value={total} tone="slate" />
        <StatPill label="Verified" value={verifiedCount} tone="green" />
        <StatPill label="Suspended" value={suspendedCount} tone="amber" />
        <StatPill label="Banned" value={bannedCount} tone="rose" />
      </section>

      {softError && (
        <div
          role="status"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-sm shadow-soft"
        >
          <span className="text-[var(--text-muted)]">{softError}</span>
        </div>
      )}

      {/* Filters */}
      <form
        method="GET"
        action="/admin/users"
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-8">
            <label className={labelClass}>Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="ID, email, name, username…"
              className={inputClass}
            />
          </div>
          <div className="md:col-span-4">
            <label className={labelClass}>Role</label>
            <select name="role" defaultValue={role} className={selectClass}>
              <option value="any">Any</option>
              <option value="USER">User</option>
              <option value="MODERATOR">Moderator</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPERADMIN">Super-admin</option>
            </select>
          </div>
          <input type="hidden" name="page" value="1" />
          <div className="md:col-span-12 flex items-end gap-2 pt-1">
            <button type="submit" className={actionBtnElevatedClass}>
              Apply
            </button>
            <Link href="/admin/users" className={actionBtnClass} prefetch={false}>
              Clear
            </Link>
          </div>
        </div>
      </form>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <h2 className="font-semibold text-[var(--text)]">Users</h2>
          <span className="text-xs text-[var(--text-muted)]">
            Total: {total.toLocaleString()} • Page {safePage} / {totalPages}
          </span>
        </div>

        {pageRows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--text-muted)]">
            No users found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">
                  Admin user list with roles, verification, status and actions
                </caption>
                <thead className="bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  <tr>
                    <Th>ID</Th>
                    <Th>Email</Th>
                    <Th>Name</Th>
                    <Th>Username</Th>
                    <Th>Role</Th>
                    <Th>Verification</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    {viewerIsSuper && <Th>Actions</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {pageRows.map((u) => {
                    const r = (u.role ?? "USER").toUpperCase().trim() as
                      | "USER"
                      | "MODERATOR"
                      | "ADMIN"
                      | "SUPERADMIN";

                    const isVerified = !!u.verified;
                    const isSuspended = !!u.suspended;
                    const isBanned = !!u.banned;

                    const statusTone = isBanned
                      ? "rose"
                      : isSuspended
                        ? "amber"
                        : "green";

                    const statusLabel = isBanned
                      ? "Banned"
                      : isSuspended
                        ? "Suspended"
                        : "Active";

                    const rowHighlight =
                      isBanned || isSuspended ? "bg-[var(--bg-subtle)]" : "";

                    const isSelf = viewerId === u.id;

                    return (
                      <tr
                        key={u.id}
                        className={[
                          "transition",
                          "hover:bg-[var(--bg-subtle)]",
                          rowHighlight,
                        ].join(" ")}
                      >
                        <Td className="font-mono text-xs">{u.id}</Td>
                        <Td>{u.email ?? "-"}</Td>
                        <Td>
                          {u.name ?? "-"}
                          {isSelf && (
                            <span className="ml-1 text-[11px] text-[var(--text-muted)]">
                              (you)
                            </span>
                          )}
                        </Td>
                        <Td>
                          {u.username ? (
                            <Link
                              href={`/store/${u.username}`}
                              prefetch={false}
                              className="font-semibold text-[var(--text)] underline underline-offset-4 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 ring-focus"
                            >
                              @{u.username}
                            </Link>
                          ) : (
                            "-"
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
                        <Td>
                          <Badge tone={isVerified ? "green" : "slate"}>
                            {isVerified ? "Verified" : "Unverified"}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex flex-col gap-1">
                            <Badge tone={statusTone}>{statusLabel}</Badge>

                            {/* Enforcement controls (admins) */}
                            <div className="flex flex-wrap gap-1">
                              <form action={setUserEnforcementFlag}>
                                <input type="hidden" name="userId" value={u.id} />
                                <input type="hidden" name="field" value="banned" />
                                <input
                                  type="hidden"
                                  name="value"
                                  value={isBanned ? "false" : "true"}
                                />
                                <button
                                  type="submit"
                                  disabled={isSelf}
                                  aria-disabled={isSelf}
                                  title={
                                    isSelf
                                      ? "You can’t update your own enforcement status."
                                      : isBanned
                                        ? "Unban user"
                                        : "Ban user"
                                  }
                                  className={enforcementBtnClass(
                                    isBanned ? "neutral" : "strong",
                                  )}
                                >
                                  {isBanned ? "Unban" : "Ban"}
                                </button>
                              </form>

                              <form action={setUserEnforcementFlag}>
                                <input type="hidden" name="userId" value={u.id} />
                                <input type="hidden" name="field" value="suspended" />
                                <input
                                  type="hidden"
                                  name="value"
                                  value={isSuspended ? "false" : "true"}
                                />
                                <button
                                  type="submit"
                                  disabled={isSelf || isBanned}
                                  aria-disabled={isSelf || isBanned}
                                  title={
                                    isSelf
                                      ? "You can’t update your own enforcement status."
                                      : isBanned
                                        ? "User is banned"
                                        : isSuspended
                                          ? "Unsuspend user"
                                          : "Suspend user"
                                  }
                                  className={enforcementBtnClass(
                                    isSuspended ? "neutral" : "strong",
                                  )}
                                >
                                  {isSuspended ? "Unsuspend" : "Suspend"}
                                </button>
                              </form>
                            </div>
                          </div>
                        </Td>
                        <Td>{fmtDateKE(u.createdAt)}</Td>
                        {viewerIsSuper ? (
                          <Td>
                            <RoleActions
                              userId={u.id}
                              currentRole={r}
                              isSelf={isSelf}
                              verified={isVerified}
                              suspended={isSuspended}
                              banned={isBanned}
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
              className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-3 text-sm"
              aria-label="Pagination"
            >
              <Link
                href={
                  safePage > 1
                    ? keepQuery("/admin/users", sp, { page: String(safePage - 1) })
                    : "#"
                }
                aria-disabled={safePage <= 1}
                className={pagerBtnClass(safePage > 1)}
              >
                ← Prev
              </Link>

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
                      href={keepQuery("/admin/users", sp, { page: String(p) })}
                      prefetch={false}
                      aria-current={isCurrent ? "page" : undefined}
                      className={pageNumClass(isCurrent)}
                    >
                      {p}
                    </Link>
                  );
                })}
              </div>

              <Link
                href={
                  safePage < totalPages
                    ? keepQuery("/admin/users", sp, { page: String(safePage + 1) })
                    : "#"
                }
                aria-disabled={safePage >= totalPages}
                className={pagerBtnClass(safePage < totalPages)}
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
    <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
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
        "whitespace-nowrap px-4 py-2 align-middle text-sm text-[var(--text)]",
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
  // Token-only styling (tone preserved for callsites/logic, but avoids legacy palette + raw Tailwind colors).
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

function StatPill({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "green" | "amber" | "rose";
}) {
  // Token-only styling (tone preserved; visual stays consistent across light/dark).
  const styles: Record<typeof tone, string> = {
    slate: "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
    green: "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
    amber: "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
    rose: "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
  } as const;

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
