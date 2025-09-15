// src/app/admin/dashboard/page.tsx
export const dynamic = "force-dynamic";

type DayPoint = { date: string; users: number; products: number; services: number };
type Metrics = {
  totals: { users: number; products: number; services: number; reveals?: number | null };
  last7d: DayPoint[];
};

function Sparkline({
  data,
  field,
  width = 320,
  height = 64,
}: {
  data: DayPoint[];
  field: keyof DayPoint;
  width?: number;
  height?: number;
}) {
  const vals = data.map((d) => Number(d[field] ?? 0));
  const max = Math.max(1, ...vals);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const pts = vals
    .map((v, i) => {
      const x = Math.round(i * stepX);
      const y = Math.round(height - (v / max) * height);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="7 day trend">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default async function Page() {
  const res = await fetch("/api/admin/metrics", { cache: "no-store" });
  if (!res.ok) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400">
        Failed to load metrics.
      </div>
    );
  }
  const metrics = (await res.json()) as Metrics;

  const card =
    "rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={card}>
          <div className="text-xs text-gray-500">Users</div>
          <div className="text-2xl font-bold">{metrics.totals.users}</div>
        </div>
        <div className={card}>
          <div className="text-xs text-gray-500">Products</div>
          <div className="text-2xl font-bold">{metrics.totals.products}</div>
        </div>
        <div className={card}>
          <div className="text-xs text-gray-500">Services</div>
          <div className="text-2xl font-bold">{metrics.totals.services}</div>
        </div>
        {metrics.totals.reveals != null && (
          <div className={card}>
            <div className="text-xs text-gray-500">Contact Reveals</div>
            <div className="text-2xl font-bold">{metrics.totals.reveals}</div>
          </div>
        )}
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-gray-600">Last 7 days</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="mb-1 text-xs text-gray-500">Users</div>
            <div className="text-[#161748]">
              <Sparkline data={metrics.last7d} field={"users"} />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">Products</div>
            <div className="text-emerald-600 dark:text-emerald-400">
              <Sparkline data={metrics.last7d} field={"products"} />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">Services</div>
            <div className="text-sky-600 dark:text-sky-400">
              <Sparkline data={metrics.last7d} field={"services"} />
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-[560px] text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Users</th>
                <th className="px-2 py-1">Products</th>
                <th className="px-2 py-1">Services</th>
              </tr>
            </thead>
            <tbody>
              {metrics.last7d.map((d) => (
                <tr key={d.date} className="border-t border-gray-100 dark:border-slate-800">
                  <td className="px-2 py-1">{d.date}</td>
                  <td className="px-2 py-1">{d.users}</td>
                  <td className="px-2 py-1">{d.products}</td>
                  <td className="px-2 py-1">{d.services}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
