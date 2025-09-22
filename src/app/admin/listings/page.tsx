// src/app/admin/listings/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

type Listing = {
  id: string;
  kind: "product" | "service";
  name: string;
  price: number | null;
  featured: boolean | null;
  createdAt: string | null;
  sellerName: string | null;
  sellerId: string | null;
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

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
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
  const url = `${base}/api/admin/listings?limit=200`;

  let rows: Listing[] | null = null;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        // ensure admin session reaches the API route
        cookie: h.get("cookie") ?? "",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = (await res.json()) as Listing[];
  } catch {
    rows = null;
  }

  if (!rows) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400">
        Failed to load listings.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-lg font-bold">Listings</h2>

      {rows.length === 0 ? (
        <div className="text-sm text-gray-600 dark:text-slate-400">No listings yet.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Price</th>
                <th className="px-2 py-1">Featured</th>
                <th className="px-2 py-1">Seller</th>
                <th className="px-2 py-1">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.kind}:${r.id}`}
                  className="border-t border-gray-100 dark:border-slate-800"
                >
                  <td className="px-2 py-1">{r.kind}</td>
                  <td className="px-2 py-1">
                    <a
                      className="text-[#39a0ca] hover:underline"
                      href={r.kind === "product" ? `/product/${r.id}` : `/service/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.name}
                    </a>
                  </td>
                  <td className="px-2 py-1">{fmtKES(r.price)}</td>
                  <td className="px-2 py-1">{r.featured ? "Yes" : "No"}</td>
                  <td className="px-2 py-1">
                    {r.sellerName ?? "—"}{" "}
                    {r.sellerId ? (
                      <span className="font-mono text-[11px] opacity-70">({r.sellerId})</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1">{fmtDateKE(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
