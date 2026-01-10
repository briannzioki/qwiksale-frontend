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

type CarrierMetrics = {
  total: number;
  activeOnline: number;
  suspended: number;
  banned: number;
  byTier: {
    BASIC: number;
    GOLD: number;
    PLATINUM: number;
  };
  byVerification: {
    UNVERIFIED: number;
    PENDING: number;
    VERIFIED: number;
    REJECTED: number;
  };
  liveCutoffSeconds: number;
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
    carriers?: CarrierMetrics | null;
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
async function safeCount(
  fn: () => Promise<number>,
  fallback = 0,
): Promise<number> {
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

async function safeCarrierCount(where?: any): Promise<number> {
  const anyPrisma = prisma as any;
  const cp = anyPrisma?.carrierProfile;
  if (cp && typeof cp.count === "function") {
    return safeCount(() => cp.count(where ? { where } : undefined), 0);
  }
  return 0;
}

function carrierModelAvailable(): boolean {
  const anyPrisma = prisma as any;
  const cp = anyPrisma?.carrierProfile;
  return Boolean(cp && typeof cp.count === "function");
}

async function loadCarrierMetrics(): Promise<CarrierMetrics | null> {
  if (!carrierModelAvailable()) return null;

  const now = new Date();
  const liveCutoffSeconds = 90;
  const liveCutoff = new Date(now.getTime() - liveCutoffSeconds * 1000);

  const [total, banned, suspended, activeOnline] = await Promise.all([
    safeCarrierCount(),
    safeCarrierCount({ bannedAt: { not: null } }),
    safeCarrierCount({ suspendedUntil: { gt: now } }),
    safeCarrierCount({
      status: "AVAILABLE",
      bannedAt: null,
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
      lastSeenAt: { gte: liveCutoff },
    }),
  ]);

  const [basic, gold, platinum] = await Promise.all([
    safeCarrierCount({ planTier: "BASIC" }),
    safeCarrierCount({ planTier: "GOLD" }),
    safeCarrierCount({ planTier: "PLATINUM" }),
  ]);

  const [unverified, pending, verified, rejected] = await Promise.all([
    safeCarrierCount({ verificationStatus: "UNVERIFIED" }),
    safeCarrierCount({ verificationStatus: "PENDING" }),
    safeCarrierCount({ verificationStatus: "VERIFIED" }),
    safeCarrierCount({ verificationStatus: "REJECTED" }),
  ]);

  return {
    total,
    activeOnline,
    suspended,
    banned,
    byTier: { BASIC: basic, GOLD: gold, PLATINUM: platinum },
    byVerification: {
      UNVERIFIED: unverified,
      PENDING: pending,
      VERIFIED: verified,
      REJECTED: rejected,
    },
    liveCutoffSeconds,
  };
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

    const [usersTotal, productsTotal, servicesTotal, carriers] = await Promise.all([
      safeCount(() => prisma.user.count(), 0),
      safeCount(() => prisma.product.count(), 0),
      safeServiceCount(),
      loadCarrierMetrics(),
    ]);

    const last7d: DayPoint[] = await Promise.all(
      days.map(async (d) => {
        const next = new Date(d);
        next.setDate(d.getDate() + 1);

        const [u, p, s] = await Promise.all([
          safeCount(
            () =>
              prisma.user.count({ where: { createdAt: { gte: d, lt: next } } }),
            0,
          ),
          safeCount(
            () =>
              prisma.product.count({
                where: { createdAt: { gte: d, lt: next } },
              }),
            0,
          ),
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
        carriers: carriers ?? null,
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
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--text)]">
        {safe.toLocaleString("en-KE")}
      </div>
      {sublabel ? (
        <div className="mt-1 text-xs text-[var(--text-muted)]">{sublabel}</div>
      ) : null}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={[
        "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={[
        "whitespace-nowrap px-3 py-2 align-middle text-sm text-[var(--text)]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

/* =========================
   Page
   ========================= */
export default async function Page() {
  // 🔐 Admin access enforced by /admin/layout via requireAdmin().

  const metrics = await withTimeout(loadMetrics(), 2200, null);

  const card =
    "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft";

  const actionBtnClass =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const actionBtnElevatedClass =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-soft transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const SectionHeaderAny = SectionHeader as any;

  if (!metrics) {
    return (
      <div className="space-y-6 text-[var(--text)]">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
          Admin Dashboard
        </h1>

        <SectionHeaderAny
          title="Admin · Dashboard"
          subtitle="Live stats for users, listings, and services."
          actions={
            <div className="flex gap-2">
              <Link
                href="/admin/listings"
                prefetch={false}
                className={actionBtnClass}
              >
                Listings
              </Link>
              <Link
                href="/admin/moderation"
                prefetch={false}
                className={actionBtnElevatedClass}
              >
                Moderation
              </Link>
            </div>
          }
        />

        <div
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-sm shadow-soft"
          role="status"
          aria-live="polite"
        >
          <span className="font-semibold text-[var(--text)]">
            Failed to load metrics.
          </span>{" "}
          <span className="text-[var(--text-muted)]">
            Please refresh and try again.
          </span>
        </div>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={card}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Messages
              </h2>
              <span className="text-xs text-[var(--text-muted)]">Inbox</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              Review buyer/seller conversations and follow up from listings.
            </p>
            <div className="mt-4">
              <Link href="/messages" prefetch={false} className={actionBtnClass}>
                Open inbox
              </Link>
            </div>
          </div>

          <div className={`lg:col-span-2 ${card}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Quick actions
              </h3>
              <span className="text-xs text-[var(--text-muted)]">
                Admin shortcuts
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/admin/users"
                prefetch={false}
                className={actionBtnClass}
              >
                Users
              </Link>
              <Link
                href="/admin/listings"
                prefetch={false}
                className={actionBtnClass}
              >
                Listings
              </Link>
              <Link
                href="/admin/carriers"
                prefetch={false}
                className={actionBtnClass}
              >
                Carriers
              </Link>
              <Link
                href="/admin/moderation"
                prefetch={false}
                className={actionBtnClass}
              >
                Moderation
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const last = metrics.last7d.at(-1);
  const subToday = (n?: number) =>
    typeof n === "number" ? `${n.toLocaleString("en-KE")} today` : undefined;

  const listingsTotal =
    (metrics.totals.products ?? 0) + (metrics.totals.services ?? 0);

  const visits =
    typeof metrics.totals.visits === "number" ? metrics.totals.visits : null;
  const reveals =
    typeof metrics.totals.reveals === "number" ? metrics.totals.reveals : null;
  const reviews =
    typeof metrics.totals.reviews === "number" ? metrics.totals.reviews : null;
  const featured =
    typeof metrics.totals.featured === "number"
      ? metrics.totals.featured
      : null;

  const carriers = metrics.totals.carriers ?? null;

  const compositionData: { label: string; value: number }[] = [
    { label: "Users", value: metrics.totals.users },
    { label: "Products", value: metrics.totals.products },
    { label: "Services", value: metrics.totals.services },
  ];

  if (visits != null) compositionData.push({ label: "Visits", value: visits });
  if (reveals != null)
    compositionData.push({ label: "Reveals", value: reveals });
  if (reviews != null) compositionData.push({ label: "Reviews", value: reviews });

  const chip =
    "inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1 text-xs font-semibold text-[var(--text)]";

  return (
    <div className="space-y-6 text-[var(--text)]">
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">
        Admin Dashboard
      </h1>

      <SectionHeaderAny
        title="Admin · Dashboard"
        subtitle="Overview of marketplace health: users, listings, and engagement over the last 7 days."
        actions={
          <div className="flex gap-2">
            <Link
              href="/admin/listings"
              prefetch={false}
              className={actionBtnClass}
            >
              Listings
            </Link>
            <Link
              href="/admin/moderation"
              prefetch={false}
              className={actionBtnElevatedClass}
            >
              Moderation
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={metrics.totals.users}
          sublabel={subToday(last?.users)}
        />
        <StatCard
          label="Listings (all)"
          value={listingsTotal}
          sublabel={subToday((last?.products ?? 0) + (last?.services ?? 0))}
        />
        <StatCard
          label="Products"
          value={metrics.totals.products}
          sublabel={subToday(last?.products)}
        />
        <StatCard
          label="Services"
          value={metrics.totals.services}
          sublabel={subToday(last?.services)}
        />

        {featured != null && (
          <StatCard label="Featured listings" value={featured} />
        )}

        {visits != null ? (
          <StatCard label="Visits" value={visits} />
        ) : (
          <div
            className={`${card} flex items-center justify-center text-sm text-[var(--text-muted)]`}
          >
            Visits not tracked
          </div>
        )}

        {reveals != null ? (
          <StatCard label="Contact reveals" value={reveals} />
        ) : (
          <div
            className={`${card} flex items-center justify-center text-sm text-[var(--text-muted)]`}
          >
            No reveals tracked
          </div>
        )}

        {reviews != null ? (
          <StatCard label="Reviews" value={reviews} />
        ) : (
          <div
            className={`${card} flex items-center justify-center text-sm text-[var(--text-muted)]`}
          >
            Reviews not tracked
          </div>
        )}
      </section>

      <section className="space-y-3" aria-label="Carrier metrics">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-extrabold tracking-tight text-[var(--text)]">
            Carriers
          </h2>
          <Link href="/admin/carriers" prefetch={false} className={actionBtnClass}>
            Manage carriers
          </Link>
        </div>

        {carriers ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total carriers" value={carriers.total} />
              <StatCard label="Active online" value={carriers.activeOnline} />
              <StatCard label="Suspended" value={carriers.suspended} />
              <StatCard label="Banned" value={carriers.banned} />
            </div>

            <div className={card} aria-label="Carrier breakdown">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    Breakdown
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Active online means status is AVAILABLE and last seen within{" "}
                    {carriers.liveCutoffSeconds}s, excluding banned or currently suspended.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Tier
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={chip}>
                      PLATINUM <span className="text-[var(--text-muted)]">·</span>{" "}
                      {carriers.byTier.PLATINUM.toLocaleString("en-KE")}
                    </span>
                    <span className={chip}>
                      GOLD <span className="text-[var(--text-muted)]">·</span>{" "}
                      {carriers.byTier.GOLD.toLocaleString("en-KE")}
                    </span>
                    <span className={chip}>
                      BASIC <span className="text-[var(--text-muted)]">·</span>{" "}
                      {carriers.byTier.BASIC.toLocaleString("en-KE")}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Verification
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={chip}>
                      VERIFIED <span className="text-[var(--text-muted)]">·</span>{" "}
                      {carriers.byVerification.VERIFIED.toLocaleString("en-KE")}
                    </span>
                    <span className={chip}>
                      PENDING <span className="text-[var(--text-muted)]">·</span>{" "}
                      {carriers.byVerification.PENDING.toLocaleString("en-KE")}
                    </span>
                    <span className={chip}>
                      UNVERIFIED <span className="text-[var(--text-muted)]">·</span>{" "}
                      {carriers.byVerification.UNVERIFIED.toLocaleString("en-KE")}
                    </span>
                    <span className={chip}>
                      REJECTED <span className="text-[var(--text-muted)]">·</span>{" "}
                      {carriers.byVerification.REJECTED.toLocaleString("en-KE")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className={card} role="status" aria-live="polite">
            <div className="text-sm font-semibold text-[var(--text)]">
              Carriers metrics not enabled yet.
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Once the CarrierProfile model exists in Prisma and migrations are applied,
              this section will auto-populate.
            </p>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">
          Last 7 days - users & listings
        </h2>

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

        <div className="mt-4 overflow-auto">
          <table className="min-w-[560px] text-xs">
            <thead className="bg-[var(--bg-subtle)]">
              <tr>
                <Th>Date</Th>
                <Th>Users</Th>
                <Th>Products</Th>
                <Th>Services</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {metrics.last7d.map((d) => (
                <tr
                  key={d.date}
                  className="transition hover:bg-[var(--bg-subtle)]"
                >
                  <Td className="text-[var(--text-muted)]">{d.date}</Td>
                  <Td>{d.users.toLocaleString("en-KE")}</Td>
                  <Td>{d.products.toLocaleString("en-KE")}</Td>
                  <Td>{d.services.toLocaleString("en-KE")}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-muted)]">
          Totals breakdown
        </h2>

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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Messages
            </h2>
            <span className="text-xs text-[var(--text-muted)]">Inbox</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Review buyer/seller conversations and follow up from listings.
          </p>
          <div className="mt-4">
            <Link href="/messages" prefetch={false} className={actionBtnClass}>
              Open inbox
            </Link>
          </div>
        </div>

        <div className={`lg:col-span-2 ${card}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--text)]">
              Quick actions
            </h3>
            <span className="text-xs text-[var(--text-muted)]">
              Admin shortcuts
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/admin/users"
              prefetch={false}
              className={actionBtnClass}
            >
              Users
            </Link>
            <Link
              href="/admin/listings"
              prefetch={false}
              className={actionBtnClass}
            >
              Listings
            </Link>
            <Link
              href="/admin/carriers"
              prefetch={false}
              className={actionBtnClass}
            >
              Carriers
            </Link>
            <Link
              href="/admin/moderation"
              prefetch={false}
              className={actionBtnClass}
            >
              Moderation
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
