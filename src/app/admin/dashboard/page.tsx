// src/app/admin/dashboard/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DayPoint = { date: string; users: number; products: number; services: number };
type Metrics = {
  totals: { users: number; products: number; services: number; reveals?: number | null };
  last7d: DayPoint[];
};

/* =========================
   UI helpers
   ========================= */
function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel?: string | undefined; // 👈 important for exactOptionalPropertyTypes
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value.toLocaleString()}</div>
      {sublabel ? <div className="mt-1 text-xs text-gray-500">{sublabel}</div> : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-3 py-2 align-middle ${className ?? ""}`}>{children}</td>;
}

/* Simple, dependency-free sparkline */
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
  const vals = data.map((d) => Number((d as any)[field] ?? 0));
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

/* =========================
   Page (layout already gates admin)
   ========================= */
export default async function Page() {
  // Relative URL so cookies/session are forwarded by Next automatically.
  let metrics: Metrics | null = null;
  try {
    const res = await fetch("/api/admin/metrics", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    metrics = (await res.json()) as Metrics;
  } catch {
    metrics = null;
  }

  if (!metrics) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-red-400">
        Failed to load metrics.
      </div>
    );
  }

  const card =
    "rounded-xl border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900";

  const last = metrics.last7d.at(-1);
  const sub = (n?: number) => (typeof n === "number" ? `${n.toLocaleString()} today` : undefined);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Admin · Dashboard</h1>
        <p className="mt-1 text-sm text-white/90">Live stats for users, products, and services (last 7 days).</p>
      </div>

      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Users" value={metrics.totals.users} sublabel={sub(last?.users)} />
        <StatCard label="Listings" value={metrics.totals.products} sublabel={sub(last?.products)} />
        <StatCard label="Active Services" value={metrics.totals.services} sublabel={sub(last?.services)} />
        <StatCard label="Featured" value={0} />
        {"reveals" in metrics.totals && metrics.totals.reveals != null ? (
          <StatCard label="Contact Reveals" value={metrics.totals.reveals ?? 0} />
        ) : (
          <div className={`${card} flex items-center justify-center text-sm text-gray-500`}>
            No reveals tracked
          </div>
        )}
      </section>

      {/* Trends */}
      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-gray-600">Last 7 days</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="mb-1 text-xs text-gray-500">Users</div>
            <div className="text-[#161748]">
              <Sparkline data={metrics.last7d} field="users" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">Products</div>
            <div className="text-emerald-600 dark:text-emerald-400">
              <Sparkline data={metrics.last7d} field="products" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">Services</div>
            <div className="text-sky-600 dark:text-sky-400">
              <Sparkline data={metrics.last7d} field="services" />
            </div>
          </div>
        </div>

        {/* Detail table */}
        <div className="mt-4 overflow-auto">
          <table className="min-w-[560px] text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <Th>Date</Th>
                <Th>Users</Th>
                <Th>Products</Th>
                <Th>Services</Th>
              </tr>
            </thead>
            <tbody>
              {metrics.last7d.map((d) => (
                <tr key={d.date} className="border-t border-gray-100 dark:border-slate-800">
                  <Td>{d.date}</Td>
                  <Td>{d.users.toLocaleString()}</Td>
                  <Td>{d.products.toLocaleString()}</Td>
                  <Td>{d.services.toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
