import Link from "next/link";
import type { SellerDashboardMetrics } from "@/app/lib/dashboard";
import { fmtInt } from "@/app/lib/dashboard";

type CarrierBlock = {
  hasProfile: boolean;
  status: string | null;
  planTier: string | null;
  isSuspended: boolean;
  isBanned: boolean;
};

type Props = {
  metrics: SellerDashboardMetrics;
  carrier?: CarrierBlock;
};

export default function DashboardMetrics({ metrics, carrier }: Props) {
  const items = [
    {
      key: "myListings" as const,
      label: "My Listings",
      value: metrics.myListingsCount,
      hint: "Products & services you’re selling",
    },
    {
      key: "products" as const,
      label: "Products",
      value: metrics.productsCount,
      hint: "Items you’ve listed for sale",
    },
    {
      key: "services" as const,
      label: "Services",
      value: metrics.servicesCount,
      hint: "Services you’ve posted",
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
      // otherwise the Playwright locator /my listings/i will see multiple matches.
      key: "likes" as const,
      label: "Listing likes",
      value: metrics.likesOnMyListings,
      hint: "Total likes across your listings",
    },
  ];

  const showCarrierCard = carrier != null;

  const carrierLabel = (() => {
    if (!carrier || carrier.hasProfile !== true) return "Create carrier account";
    if (carrier.isBanned === true) return "Banned";
    if (carrier.isSuspended === true) return "Suspended";

    const raw = String(carrier.status || "").trim().toUpperCase();
    if (raw === "AVAILABLE") return "Available";
    if (raw === "ON_TRIP") return "On trip";
    if (raw === "OFFLINE") return "Offline";
    return carrier.status ? carrier.status : "Offline";
  })();

  const carrierHint = (() => {
    if (!carrier || carrier.hasProfile !== true) return "Create a carrier account to start earning from deliveries";
    if (carrier.isBanned === true) return "Carrier actions are blocked while banned";
    if (carrier.isSuspended === true) return "Carrier actions are paused while suspended";
    return "Manage your availability and requests";
  })();

  const carrierCta = (() => {
    if (!carrier || carrier.hasProfile !== true) {
      return { href: "/carrier/onboarding", label: "Create account" };
    }
    return { href: "/carrier", label: "Open dashboard" };
  })();

  const cardClass =
    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4 md:p-5";

  const labelClass = "text-xs font-medium text-[var(--text-muted)] sm:text-sm";
  const valueClass = "mt-1 text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl";
  const hintClass = "mt-1 text-[11px] leading-relaxed text-[var(--text-muted)] sm:mt-2 sm:text-xs";

  return (
    <section
      aria-label="Dashboard summary"
      data-e2e="dashboard-summary"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4"
    >
      {items.map((item) => (
        <article key={item.key} data-e2e={`dashboard-metric-${item.key}`} className={cardClass}>
          <div className={labelClass}>{item.label}</div>
          <div className={valueClass}>{fmtInt(item.value)}</div>
          {item.hint ? <p className={hintClass}>{item.hint}</p> : null}
        </article>
      ))}

      {showCarrierCard ? (
        <article data-e2e="dashboard-metric-carrier" className={cardClass}>
          <div className={labelClass}>Carrier status</div>
          <div className={valueClass}>{carrierLabel}</div>
          <p className={hintClass}>{carrierHint}</p>
          <div className="mt-3">
            <Link
              href={carrierCta.href}
              prefetch={false}
              className="btn-outline"
              aria-label={carrier?.hasProfile ? "Open carrier dashboard" : "Create carrier account"}
            >
              {carrierCta.label}
            </Link>
          </div>
        </article>
      ) : null}
    </section>
  );
}
