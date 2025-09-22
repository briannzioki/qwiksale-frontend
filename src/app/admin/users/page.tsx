// src/app/admin/users/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import type { Metadata } from "next";

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

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env["ADMIN_EMAILS"] ?? "";
  const admins = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(String(email).toLowerCase());
}

const fmtDateKE = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "medium",
      timeZone: "Africa/Nairobi",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
};

export default async function Page() {
  // Server-side admin guard
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  if (!isAdmin(email)) return notFound();

  // Build absolute same-origin URL (Next 15: headers() is async) & forward cookies
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host =
    h.get("host") ?? new URL(process.env["NEXTAUTH_URL"] ?? "http://localhost:3000").host;
  const base = `${proto}://${host}`;
  const url = `${base}/api/admin/users?limit=100`;

  let users: AdminUser[] | null = null;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        cookie: h.get("cookie") ?? "",
      },
    });
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

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-lg font-bold">Users</h2>

      {users.length === 0 ? (
        <div className="text-sm text-gray-600 dark:text-slate-300">No users found.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-2 py-1">ID</th>
                <th className="px-2 py-1">Email</th>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Username</th>
                <th className="px-2 py-1">Role</th>
                <th className="px-2 py-1">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100 dark:border-slate-800">
                  <td className="px-2 py-1 font-mono text-xs">{u.id}</td>
                  <td className="px-2 py-1">{u.email ?? "—"}</td>
                  <td className="px-2 py-1">{u.name ?? "—"}</td>
                  <td className="px-2 py-1">{u.username ?? "—"}</td>
                  <td className="px-2 py-1">{(u.role || "USER").toUpperCase()}</td>
                  <td className="px-2 py-1">{fmtDateKE(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
