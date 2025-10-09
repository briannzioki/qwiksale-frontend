// src/app/admin/users/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";

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
  role: string | null;          // e.g. "ADMIN" | "USER"
  createdAt: string | null;     // ISO
};

const fmtDateKE = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "medium",
      timeZone: "Africa/Nairobi",
    }).format(new Date(iso));
  } catch {
    // Fallback if locale/timezone not available
    return new Date(iso).toLocaleDateString();
  }
};

/* =========================
   Page (layout already gates admin)
   ========================= */
export default async function Page() {
  let users: AdminUser[] | null = null;

  try {
    // Relative URL so cookies/session are forwarded server-side by Next
    const res = await fetch("/api/admin/users?limit=100", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    users = (await res.json()) as AdminUser[];
  } catch {
    users = null;
  }

  if (!users) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400">
        Failed to load users.
      </div>
    );
  }

  const total = users.length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Users</h1>
        <p className="mt-1 text-sm text-white/90">
          Managing accounts and roles. Showing the latest {total.toLocaleString()}.
        </p>
      </div>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">All Users</h2>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            Total: {total.toLocaleString()}
          </span>
        </div>

        {users.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600 dark:text-slate-300">No users found.</div>
        ) : (
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
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {users.map((u) => (
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
                      <Badge tone={(u.role ?? "USER") === "ADMIN" ? "green" : "slate"}>
                        {(u.role ?? "USER").toUpperCase()}
                      </Badge>
                    </Td>
                    <Td>{fmtDateKE(u.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
