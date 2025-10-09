// src/app/admin/listings/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Listings · QwikSale Admin",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

type Listing = {
  id: string;
  kind: "product" | "service";
  name: string;
  price: number | null;
  featured: boolean | null;
  createdAt: string | null; // ISO
  sellerName: string | null;
  sellerId: string | null;
};

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
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
  // Layout already gates admin access.

  let rows: Listing[] | null = null;
  try {
    // Relative URL => cookies/session forwarded automatically
    const res = await fetch("/api/admin/listings?limit=200", { cache: "no-store" });
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

  const total = rows.length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Listings</h1>
        <p className="mt-1 text-sm text-white/90">
          Products & services across the marketplace. Showing {total.toLocaleString()}.
        </p>
      </div>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">All Listings</h2>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            Total: {total.toLocaleString()}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600 dark:text-slate-300">No listings yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 dark:bg-slate-800/50 dark:text-slate-300">
                <tr className="text-left">
                  <Th>Type</Th>
                  <Th>Name</Th>
                  <Th>Price</Th>
                  <Th>Featured</Th>
                  <Th>Seller</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={`${r.kind}:${r.id}`} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                    <Td>
                      <Badge tone={r.kind === "product" ? "indigo" : "green"}>
                        {r.kind === "product" ? "Product" : "Service"}
                      </Badge>
                    </Td>
                    <Td>
                      <Link
                        href={r.kind === "product" ? `/product/${r.id}` : `/service/${r.id}`}
                        className="underline text-[#161748] dark:text-[#39a0ca]"
                      >
                        {r.name}
                      </Link>
                    </Td>
                    <Td>{fmtKES(r.price)}</Td>
                    <Td>{r.featured ? <Badge tone="indigo">Featured</Badge> : <Badge>—</Badge>}</Td>
                    <Td>
                      {r.sellerName ?? "—"}{" "}
                      {r.sellerId ? (
                        <span className="font-mono text-[11px] opacity-70">({r.sellerId})</span>
                      ) : null}
                    </Td>
                    <Td>{fmtDateKE(r.createdAt)}</Td>
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

/* ===== UI bits ===== */
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
