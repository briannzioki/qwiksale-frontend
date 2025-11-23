// src/app/admin/dashboard/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";

export const metadata: Metadata = {
  title: "Dashboard · QwikSale Admin",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

type DayPoint = {
  date: string;
  users: number;
  products: number;
  services: number;
};

type Metrics = {
  totals: {
    users: number;
    products: number;
    services: number;
    reveals?: number | null;
    featured?: number | null;
  };
  last7d: DayPoint[];
};

/* =========================
   Timeout helpers
   ========================= */
function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => {
    tid = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.catch(() => fallback), timeout]).finally(() => {
    if (tid) clearTimeout(tid);
  }) as Promise<T>;
}

/* =========================
   Data fetch
   ========================= */
async function fetchMetrics(timeoutMs = 2000): Promise<Metrics | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Prefer configured public URL; fall back to relative.
    const base = (process.env["NEXT_PUBLIC_APP_URL"] || "").replace(/\/+$/, "");
    const url = (base || "") + "/api/admin/metrics";

    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as Metrics | null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* =========================
   UI helpers
   ========================= */
function StatCard({
  label,
  value,
  // exactOptionalPropertyTypes-safe: explicitly allow undefined
  sublabel,
}: {
  label: string;
  value: number;
  sublabel?: string | undefined;
}) {
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">
        {safe.toLocaleString("en-KE")}
      </div>
      {sublabel ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 align-middle ${
        className ?? ""
      }`}
    >
      {children}
    </td>
  );
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
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="7 day trend"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  );
}

/* =========================
   Page
   ========================= */
export default async function Page() {
  // 🔐 Admin access enforced by /admin/layout via requireAdmin().

  const metrics = await withTimeout(fetchMetrics(2000), 2200, null);

  const card =
    "rounded-xl border border-border bg-card p-4 shadow-sm";

  // Always render the H1 so tests can assert reliably.
  if (!metrics) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>

        <SectionHeader
          title="Admin · Dashboard"
          subtitle="Live stats for users, products, and services (last 7 days)."
          actions={
            <div className="flex gap-2">
              <Link
                href="/admin/listings"
                className="btn-outline text-sm"
              >
                Listings
              </Link>
              <Link
                href="/admin/moderation"
                className="btn-gradient-primary text-sm"
              >
                Moderation
              </Link>
            </div>
          }
        />

        <div
          className="rounded-xl border border-border bg-card p-4 text-sm text-rose-600 dark:text-rose-400"
          role="status"
          aria-live="polite"
        >
          Failed to load metrics.
        </div>
      </div>
    );
  }

  const last = metrics.last7d.at(-1);
  const sub = (n?: number) =>
    typeof n === "number"
      ? `${n.toLocaleString("en-KE")} today`
      : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <SectionHeader
        title="Admin · Dashboard"
        subtitle="Live stats for users, products, and services (last 7 days)."
        actions={
          <div className="flex gap-2">
            <Link
              href="/admin/listings"
              className="btn-outline text-sm"
            >
              Listings
            </Link>
            <Link
              href="/admin/moderation"
              className="btn-gradient-primary text-sm"
            >
              Moderation
            </Link>
          </div>
        }
      />

      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Users"
          value={metrics.totals.users}
          sublabel={sub(last?.users)}
        />
        <StatCard
          label="Listings"
          value={metrics.totals.products}
          sublabel={sub(last?.products)}
        />
        <StatCard
          label="Active Services"
          value={metrics.totals.services}
          sublabel={sub(last?.services)}
        />
        <StatCard
          label="Featured"
          value={Number(metrics.totals.featured ?? 0)}
        />
        {"reveals" in metrics.totals &&
        metrics.totals.reveals != null ? (
          <StatCard
            label="Contact Reveals"
            value={metrics.totals.reveals ?? 0}
          />
        ) : (
          <div
            className={`${card} flex items-center justify-center text-sm text-muted-foreground`}
          >
            No reveals tracked
          </div>
        )}
      </section>

      {/* Trends */}
      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Last 7 days
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              Users
            </div>
            <div className="text-[#161748]">
              <Sparkline data={metrics.last7d} field="users" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              Products
            </div>
            <div className="text-emerald-600 dark:text-emerald-400">
              <Sparkline data={metrics.last7d} field="products" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">
              Services
            </div>
            <div className="text-sky-600 dark:text-sky-400">
              <Sparkline data={metrics.last7d} field="services" />
            </div>
          </div>
        </div>

        {/* Detail table */}
        <div className="mt-4 overflow-auto">
          <table className="min-w-[560px] text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <Th>Date</Th>
                <Th>Users</Th>
                <Th>Products</Th>
                <Th>Services</Th>
              </tr>
            </thead>
            <tbody>
              {metrics.last7d.map((d) => (
                <tr
                  key={d.date}
                  className="border-t border-border/60"
                >
                  <Td>{d.date}</Td>
                  <Td>{d.users.toLocaleString("en-KE")}</Td>
                  <Td>{d.products.toLocaleString("en-KE")}</Td>
                  <Td>{d.services.toLocaleString("en-KE")}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
