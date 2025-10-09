// src/app/admin/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";

/* =========================
   Selects -> Types from Prisma
   ========================= */
const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  role: true,          // Prisma enum
  subscription: true,  // Prisma enum
  createdAt: true,
} as const;
type AdminUserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const productSelect = {
  id: true,
  name: true,
  image: true,
  price: true,
  featured: true,
  status: true, // Prisma enum
  category: true,
  subcategory: true,
  createdAt: true,
  seller: { select: { id: true, username: true, name: true } },
} as const;
type AdminProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

/* =========================
   Helpers
   ========================= */
const fmtKES = (n?: number | null) =>
  typeof n === "number" && n > 0
    ? `KES ${new Intl.NumberFormat("en-KE").format(n)}`
    : "—";

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-KE", { year: "numeric", month: "short", day: "2-digit" }).format(d);

/** Safely count Service records even if your Prisma schema has no `Service` model yet. */
async function safeServiceCount(where?: any): Promise<number> {
  const anyPrisma = prisma as any;
  const svc = anyPrisma?.service;
  if (svc && typeof svc.count === "function") {
    return svc.count(where ? { where } : undefined);
  }
  return 0;
}

/** Map product status -> badge tone; tolerant to enum drift */
type BadgeTone = "slate" | "green" | "amber" | "rose" | "indigo";
type ProductStatus = AdminProductRow["status"];

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "green",
  SOLD: "rose",
  HIDDEN: "slate",
  DRAFT: "amber",
};

function statusTone(status: ProductStatus): BadgeTone {
  const key = String(status).toUpperCase();
  return STATUS_TONE[key] ?? "slate";
}

/* =========================
   Page
   ========================= */
export default async function AdminPage() {
  // NOTE: layout already gates admin; no need to call requireAdmin() again here.

  // Parallel fetches with graceful fallbacks
  const [
    usersCountR,
    productsCountR,
    featuredCountR,
    activeCountR,
    servicesCountR,
    recentUsersR,
    recentProductsR,
  ] = await Promise.allSettled([
    prisma.user.count(),
    prisma.product.count(),
    prisma.product.count({ where: { featured: true } }),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    safeServiceCount({ status: "ACTIVE" }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: userSelect }),
    prisma.product.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: productSelect }),
  ]);

  const usersCount      = usersCountR.status === "fulfilled" ? usersCountR.value : 0;
  const productsCount   = productsCountR.status === "fulfilled" ? productsCountR.value : 0;
  const featuredCount   = featuredCountR.status === "fulfilled" ? featuredCountR.value : 0;
  const activeCount     = activeCountR.status === "fulfilled" ? activeCountR.value : 0;
  const servicesActive  = servicesCountR.status === "fulfilled" ? servicesCountR.value : 0;
  const recentUsers     = recentUsersR.status === "fulfilled" ? (recentUsersR.value as AdminUserRow[]) : [];
  const recentProducts  = recentProductsR.status === "fulfilled" ? (recentProductsR.value as AdminProductRow[]) : [];

  const hadError =
    usersCountR.status === "rejected" ||
    productsCountR.status === "rejected" ||
    featuredCountR.status === "rejected" ||
    activeCountR.status === "rejected" ||
    servicesCountR.status === "rejected" ||
    recentUsersR.status === "rejected" ||
    recentProductsR.status === "rejected";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-white/90">High-level overview of users and listings.</p>
      </div>

      {hadError ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Some data failed to load. Showing partial results.
        </div>
      ) : null}

      {/* Metrics */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Users" value={usersCount} />
        <StatCard label="Listings" value={productsCount} />
        <StatCard label="Featured" value={featuredCount} />
        <StatCard label="Active" value={activeCount} />
        <StatCard label="Active Services" value={servicesActive} />
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/admin/users" label="Manage users" />
        <QuickLink href="/admin/listings" label="Browse listings" />
        <QuickLink href="/admin/moderation" label="Moderate content" />
        <QuickLink href="/admin/reveals" label="Check reveals" />
      </section>

      {/* Recent users */}
      <section
        aria-labelledby="recent-users-heading"
        className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="border-b px-4 py-3 dark:border-slate-800">
          <h2 id="recent-users-heading" className="font-semibold">
            Recent Users
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800/50 dark:text-slate-300">
              <tr>
                <Th>Username</Th>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Plan</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {recentUsers.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="py-6 text-center text-gray-500">
                    No users yet.
                  </Td>
                </tr>
              ) : (
                recentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                    <Td>
                      {u.username ? (
                        <Link
                          href={`/store/${u.username}`}
                          className="underline text-[#161748] dark:text-[#39a0ca]"
                        >
                          @{u.username}
                        </Link>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </Td>
                    <Td>{u.name ?? "—"}</Td>
                    <Td>{u.email ?? "—"}</Td>
                    <Td><Badge tone={u.role === "ADMIN" ? "green" : "slate"}>{u.role}</Badge></Td>
                    <Td>{u.subscription}</Td>
                    <Td>{fmtDate(u.createdAt)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent listings */}
      <section
        aria-labelledby="recent-listings-heading"
        className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="border-b px-4 py-3 dark:border-slate-800">
          <h2 id="recent-listings-heading" className="font-semibold">
            Recent Listings
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800/50 dark:text-slate-300">
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th>Price</Th>
                <Th>Status</Th>
                <Th>Featured</Th>
                <Th>Seller</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-slate-800">
              {recentProducts.length === 0 ? (
                <tr>
                  <Td colSpan={7} className="py-6 text-center text-gray-500">
                    No listings yet.
                  </Td>
                </tr>
              ) : (
                recentProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                    <Td>
                      <Link href={`/product/${p.id}`} className="underline text-[#161748] dark:text-[#39a0ca]">
                        {p.name}
                      </Link>
                    </Td>
                    <Td>
                      {p.category} {p.subcategory ? <>• {p.subcategory}</> : null}
                    </Td>
                    <Td>{fmtKES(p.price)}</Td>
                    <Td>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </Td>
                    <Td>{p.featured ? <Badge tone="indigo">Featured</Badge> : <Badge>—</Badge>}</Td>
                    <Td>
                      {p.seller?.username ? (
                        <Link href={`/store/${p.seller.username}`} className="underline">
                          @{p.seller.username}
                        </Link>
                      ) : p.seller?.name ? (
                        p.seller.name
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>{fmtDate(p.createdAt)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* =========================
   Small presentational bits
   ========================= */
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900"
    >
      <span className="bg-gradient-to-r from-[#161748] to-[#39a0ca] bg-clip-text text-transparent group-hover:opacity-90">
        {label}
      </span>
    </Link>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-2 text-left font-semibold">{children}</th>;
}

function Td({
  children,
  colSpan,
  className,
}: {
  children: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td className={`whitespace-nowrap px-4 py-2 align-middle ${className ?? ""}`} colSpan={colSpan}>
      {children}
    </td>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "rose" | "indigo";
}) {
  const map: Record<string, string> = {
    slate:  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    green:  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    amber:  "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    rose:   "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
    indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}
