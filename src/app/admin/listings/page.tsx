// src/app/admin/listings/page.tsx
export const dynamic = "force-dynamic";

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

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

export default async function Page() {
  const res = await fetch("/api/admin/listings?limit=200", { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400">
        Failed to load listings.
      </div>
    );
  }
  const rows = (await res.json()) as Listing[];

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-lg font-bold">Listings</h2>
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
              <tr key={`${r.kind}:${r.id}`} className="border-t border-gray-100 dark:border-slate-800">
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
                <td className="px-2 py-1">
                  {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
