// src/app/dashboard/_components/DashboardMetrics.tsx

import type { SellerDashboardMetrics } from "@/app/lib/dashboard";
import { fmtInt } from "@/app/lib/dashboard";

type Props = {
  metrics: SellerDashboardMetrics;
};

/**
 * DashboardMetrics
 *
 * Grid of numeric KPI cards for the seller dashboard.
 * Intended usage:
 *
 *   <DashboardMetrics metrics={metrics} />
 *
 * The section is exposed as an ARIA region so tests and
 * assistive tech can reliably target the dashboard summary.
 */
export default function DashboardMetrics({ metrics }: Props) {
  const items = [
    {
      key: "myListings" as const,
      label: "My Listings",
      value: metrics.myListingsCount,
      hint: "Products & services you’re selling",
    },
    {
      key: "favorites" as const,
      label: "My Favorites",
      value: metrics.favoritesCount,
      hint: "Listings you’ve saved",
    },
    {
      key: "newLast7Days" as const,
      label: "New in last 7 days",
      value: metrics.newLast7Days,
      hint: "Listings you posted this week",
    },
    {
      // IMPORTANT: do NOT include "my listings" in this copy,
      // otherwise the Playwright locator /my listings/i will
      // see multiple matches and strict mode will explode.
      key: "likes" as const,
      label: "Listing likes",
      value: metrics.likesOnMyListings,
      hint: "Total likes across your listings",
    },
  ];

  return (
    <section
      aria-label="Dashboard summary"
      data-e2e="dashboard-summary"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {items.map((item) => (
        <article
          key={item.key}
          data-e2e={`dashboard-metric-${item.key}`}
          className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="text-sm font-medium text-muted-foreground">
            {item.label}
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {fmtInt(item.value)}
          </div>
          {item.hint && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {item.hint}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
