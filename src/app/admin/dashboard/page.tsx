// src/app/admin/dashboard/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import { LineChart } from "@/app/components/charts/LineChart";
import { BarChart } from "@/app/components/charts/BarChart";
import type { ReactNode } from "react";
import { prisma } from "@/app/lib/prisma";

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
    visits?: number | null;
    reviews?: number | null;
  };
  last7d: DayPoint[];
};

/* =========================
   Timeout helpers
   ========================= */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => {
    tid = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.catch(() => fallback), timeout]).finally(() => {
    if (tid) clearTimeout(tid);
  }) as Promise<T>;
}

/* =========================
   Prisma-safe counting helpers
   (avoid hard crashes on schema drift)
   ========================= */
async function safeCount(fn: () => Promise<number>, fallback = 0): Promise<number> {
  try {
    const n = await fn();
    return Number.isFinite(n) ? n : fallback;
  } catch (e) {
    console.error("[admin-dashboard] metrics count failed:", e);
    return fallback;
  }
}

async function safeServiceCount(where?: any): Promise<number> {
  const anyPrisma = prisma as any;
  const svc = anyPrisma?.service;
  if (svc && typeof svc.count === "function") {
    return safeCount(() => svc.count(where ? { where } : undefined), 0);
  }
  return 0;
}

async function loadMetrics(): Promise<Metrics | null> {
  try {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const [usersTotal, productsTotal, servicesTotal] = await Promise.all([
      safeCount(() => prisma.user.count(), 0),
      safeCount(() => prisma.product.count(), 0),
      safeServiceCount(),
    ]);

    const last7d: DayPoint[] = await Promise.all(
      days.map(async (d) => {
        const next = new Date(d);
        next.setDate(d.getDate() + 1);

        const [u, p, s] = await Promise.all([
          safeCount(() => prisma.user.count({ where: { createdAt: { gte: d, lt: next } } }), 0),
          safeCount(() => prisma.product.count({ where: { createdAt: { gte: d, lt: next } } }), 0),
          safeServiceCount({ createdAt: { gte: d, lt: next } }),
        ]);

        return {
          date: d.toISOString().slice(0, 10),
          users: u,
          products: p,
          services: s,
        };
      }),
    );

    return {
      totals: {
        users: usersTotal,
        products: productsTotal,
        services: servicesTotal,
        visits: null,
        reveals: null,
        reviews: null,
        featured: null,
      },
      last7d,
    };
  } catch (e) {
    console.error("[admin-dashboard] loadMetrics failed:", e);
    return null;
  }
}

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
  sublabel?: string | undefined;
}) {
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{safe.toLocaleString("en-KE")}</div>
      {sublabel ? <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div> : null}
    </div>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-left text-xs font-semibold ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 align-middle ${className ?? ""}`}>{children}</td>
  );
}

/* =========================
   Page
   ========================= */
export default async function Page() {
  // 🔐 Admin access enforced by /admin/layout via requireAdmin().

  const metrics = await withTimeout(loadMetrics(), 2200, null);

  const card = "rounded-xl border border-border bg-card p-4 shadow-sm";

  // Always render the H1 so tests can assert reliably.
  if (!metrics) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>

        <SectionHeader
          title="Admin · Dashboard"
          subtitle="Live stats for users, listings, and services."
          actions={
            <div className="flex gap-2">
              <Link href="/admin/listings" className="btn-outline text-sm">
                Listings
              </Link>
              <Link href="/admin/moderation" className="btn-gradient-primary text-sm">
                Moderation
              </Link>
            </div>
          }
        />

        <div
          className="rounded-xl border border-border bg-card p-4 text-sm text-rose-600"
          role="status"
          aria-live="polite"
        >
          Failed to load metrics.
        </div>

        {/* Messages / chats widget (always rendered) */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={card}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Messages</h2>
              <span className="text-xs text-muted-foreground">Inbox</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Review buyer/seller conversations and follow up from listings.
            </p>
            <div className="mt-4">
              <Link href="/messages" prefetch={false} className="btn-outline text-sm">
                Open inbox
              </Link>
            </div>
          </div>

          <div className={`lg:col-span-2 ${card}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
              <span className="text-xs text-muted-foreground">Admin shortcuts</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/users" className="btn-outline text-sm">
                Users
              </Link>
              <Link href="/admin/listings" className="btn-outline text-sm">
                Listings
              </Link>
              <Link href="/admin/moderation" className="btn-outline text-sm">
                Moderation
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const last = metrics.last7d.at(-1);
  const subToday = (n?: number) => (typeof n === "number" ? `${n.toLocaleString("en-KE")} today` : undefined);

  const listingsTotal = (metrics.totals.products ?? 0) + (metrics.totals.services ?? 0);

  const visits = typeof metrics.totals.visits === "number" ? metrics.totals.visits : null;
  const reveals = typeof metrics.totals.reveals === "number" ? metrics.totals.reveals : null;
  const reviews = typeof metrics.totals.reviews === "number" ? metrics.totals.reviews : null;
  const featured = typeof metrics.totals.featured === "number" ? metrics.totals.featured : null;

  const compositionData: { label: string; value: number }[] = [
    { label: "Users", value: metrics.totals.users },
    { label: "Products", value: metrics.totals.products },
    { label: "Services", value: metrics.totals.services },
  ];

  if (visits != null) compositionData.push({ label: "Visits", value: visits });
  if (reveals != null) compositionData.push({ label: "Reveals", value: reveals });
  if (reviews != null) compositionData.push({ label: "Reviews", value: reviews });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <SectionHeader
        title="Admin · Dashboard"
        subtitle="Overview of marketplace health: users, listings, and engagement over the last 7 days."
        actions={
          <div className="flex gap-2">
            <Link href="/admin/listings" className="btn-outline text-sm">
              Listings
            </Link>
            <Link href="/admin/moderation" className="btn-gradient-primary text-sm">
              Moderation
            </Link>
          </div>
        }
      />

      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={metrics.totals.users} sublabel={subToday(last?.users)} />
        <StatCard
          label="Listings (all)"
          value={listingsTotal}
          sublabel={subToday((last?.products ?? 0) + (last?.services ?? 0))}
        />
        <StatCard label="Products" value={metrics.totals.products} sublabel={subToday(last?.products)} />
        <StatCard label="Services" value={metrics.totals.services} sublabel={subToday(last?.services)} />

        {featured != null && <StatCard label="Featured listings" value={featured} />}

        {visits != null ? (
          <StatCard label="Visits" value={visits} />
        ) : (
          <div className={`${card} flex items-center justify-center text-sm text-muted-foreground`}>
            Visits not tracked
          </div>
        )}

        {reveals != null ? (
          <StatCard label="Contact reveals" value={reveals} />
        ) : (
          <div className={`${card} flex items-center justify-center text-sm text-muted-foreground`}>
            No reveals tracked
          </div>
        )}

        {reviews != null ? (
          <StatCard label="Reviews" value={reviews} />
        ) : (
          <div className={`${card} flex items-center justify-center text-sm text-muted-foreground`}>
            Reviews not tracked
          </div>
        )}
      </section>

      {/* Time-series trends */}
      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Last 7 days – users & listings</h2>

        <LineChart
          data={metrics.last7d}
          xKey="date"
          series={[
            { dataKey: "users", label: "Users" },
            { dataKey: "products", label: "Products" },
            { dataKey: "services", label: "Services" },
          ]}
          height={260}
          showLegend
          showGrid
        />

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
                <tr key={d.date} className="border-t border-border/60">
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

      {/* Composition / breakdown */}
      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Totals breakdown</h2>

        <BarChart
          data={compositionData}
          xKey="label"
          series={[
            {
              dataKey: "value",
              label: "Total",
            },
          ]}
          height={260}
          showLegend={false}
          showGrid
        />
      </section>

      {/* Messages / chats widget */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Messages</h2>
            <span className="text-xs text-muted-foreground">Inbox</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Review buyer/seller conversations and follow up from listings.
          </p>
          <div className="mt-4">
            <Link href="/messages" prefetch={false} className="btn-outline text-sm">
              Open inbox
            </Link>
          </div>
        </div>

        <div className={`lg:col-span-2 ${card}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
            <span className="text-xs text-muted-foreground">Admin shortcuts</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/users" className="btn-outline text-sm">
              Users
            </Link>
            <Link href="/admin/listings" className="btn-outline text-sm">
              Listings
            </Link>
            <Link href="/admin/moderation" className="btn-outline text-sm">
              Moderation
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
