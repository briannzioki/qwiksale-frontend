// src/app/admin/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

/* =========================
   Row types (keep in sync with schema)
   ========================= */
type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  role: "USER" | "MODERATOR" | "ADMIN";
  subscription: "BASIC" | "GOLD" | "PLATINUM";
  createdAt: Date;
};

type AdminProductRow = {
  id: string;
  name: string;
  image: string | null;
  price: number | null;
  featured: boolean;
  status: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";
  category: string;
  subcategory: string;
  createdAt: Date;
  seller: { id: string; username: string | null; name: string | null } | null;
};

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "—";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

export default async function AdminPage() {
  // Require auth + admin role
  const session = await auth();
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) notFound();

  const me = await prisma.user.findUnique({
    where: { id: uid },
    select: { role: true },
  });
  if (!me || me.role !== "ADMIN") {
    // Hide existence of page for non-admins
    notFound();
  }

  // Parallel data fetches
  const [
    usersCount,
    productsCount,
    featuredCount,
    activeCount,
    recentUsersRaw,
    recentProductsRaw,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.product.count(),
    prisma.product.count({ where: { featured: true } }),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        subscription: true,
        createdAt: true,
      },
    }),
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        image: true,
        price: true,
        featured: true,
        status: true,
        category: true,
        subcategory: true,
        createdAt: true,
        seller: { select: { id: true, username: true, name: true } },
      },
    }),
  ]);

  // Cast to our row types so map callbacks can be typed explicitly (no implicit any)
  const recentUsers = recentUsersRaw as AdminUserRow[];
  const recentProducts = recentProductsRaw as AdminProductRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Admin Dashboard</h1>
        <p className="text-white/90 text-sm mt-1">
          High-level overview of users and listings.
        </p>
      </div>

      {/* Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Users" value={usersCount} />
        <StatCard label="Listings" value={productsCount} />
        <StatCard label="Featured" value={featuredCount} />
        <StatCard label="Active" value={activeCount} />
      </section>

      {/* Recent users */}
      <section className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b dark:border-slate-800">
          <h2 className="font-semibold">Recent Users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-300">
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
              {recentUsers.map((u: AdminUserRow) => (
                <tr key={u.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                  <Td>
                    {u.username ? (
                      <Link href={`/store/${u.username}`} className="text-[#161748] dark:text-[#39a0ca] underline">
                        @{u.username}
                      </Link>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </Td>
                  <Td>{u.name || "—"}</Td>
                  <Td>{u.email || "—"}</Td>
                  <Td>{u.role}</Td>
                  <Td>{u.subscription}</Td>
                  <Td>{new Date(u.createdAt).toLocaleDateString()}</Td>
                </tr>
              ))}
              {recentUsers.length === 0 && (
                <tr>
                  <Td colSpan={6} className="text-center text-gray-500 py-6">
                    No users yet.
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent listings */}
      <section className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b dark:border-slate-800">
          <h2 className="font-semibold">Recent Listings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-300">
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
              {recentProducts.map((p: AdminProductRow) => (
                <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                  <Td>
                    <Link href={`/product/${p.id}`} className="text-[#161748] dark:text-[#39a0ca] underline">
                      {p.name}
                    </Link>
                  </Td>
                  <Td>{p.category} • {p.subcategory}</Td>
                  <Td>{fmtKES(p.price)}</Td>
                  <Td>{p.status}</Td>
                  <Td>{p.featured ? "Yes" : "No"}</Td>
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
                  <Td>{new Date(p.createdAt).toLocaleDateString()}</Td>
                </tr>
              ))}
              {recentProducts.length === 0 && (
                <tr>
                  <Td colSpan={7} className="text-center text-gray-500 py-6">
                    No listings yet.
                  </Td>
                </tr>
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
    <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 shadow-sm p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-semibold px-4 py-2 whitespace-nowrap">
      {children}
    </th>
  );
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
    <td className={`px-4 py-2 align-middle whitespace-nowrap ${className || ""}`} colSpan={colSpan}>
      {children}
    </td>
  );
}
