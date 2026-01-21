"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import * as React from "react";

/** Seed shape for SSR service anchors on the home page. */
export type HomeServiceSeed = {
  id: string;
  name?: string | null | undefined;
  price?: number | null | undefined;
  image?: string | null | undefined;
  category?: string | null | undefined;
  subcategory?: string | null | undefined;
  location?: string | null | undefined;
};

/** With exactOptionalPropertyTypes, optional ≠ includes undefined,
 *  so we explicitly allow `| undefined`.
 */
export type HomeSeedProps = {
  productId?: string | undefined;
  serviceId?: string | undefined;
  initialTab?: "all" | "products" | "services" | undefined;
  initialServices?: HomeServiceSeed[] | undefined;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * Loading state used when the real HomeClient is still being loaded.
 * We purposely accept `props: any` here so we can read `initialTab`
 * and `initialServices` while staying compatible with Next's
 * DynamicOptionsLoadingProps typing.
 */
const LoadingHomeFeed = (props: any) => {
  const tab: "all" | "products" | "services" =
    props?.initialTab === "products" ||
    props?.initialTab === "services" ||
    props?.initialTab === "all"
      ? props.initialTab
      : "all";

  const services: HomeServiceSeed[] =
    tab === "services" && Array.isArray(props?.initialServices)
      ? (props.initialServices as HomeServiceSeed[])
      : [];

  if (services.length > 0) {
    return (
      <section
        id="search-results"
        className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 sm:gap-6"
        aria-label="Home feed results"
        aria-busy="true"
      >
        {services.map((svc, idx) => {
          const title = (typeof svc.name === "string" && svc.name) || "Service";
          const href = `/service/${encodeURIComponent(svc.id)}`;
          const categoryText =
            svc.category && svc.subcategory
              ? `${svc.category} • ${svc.subcategory}`
              : svc.category || svc.subcategory || "General";
          const priceLabel =
            typeof svc.price === "number" && svc.price > 0
              ? `KES ${svc.price.toLocaleString("en-KE", {
                  maximumFractionDigits: 0,
                })}`
              : "Contact for price";

          return (
            <Link
              key={`seed-service-${svc.id}-${idx}`}
              href={href}
              className="group relative block"
              aria-label={`Service: ${title}`}
              data-service-id={svc.id}
              prefetch={false}
            >
              <div
                className={cx(
                  "relative overflow-hidden rounded-xl border shadow-sm transition",
                  "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
                  "hover:-translate-y-0.5 hover:shadow-soft",
                )}
              >
                <div className="h-36 w-full animate-pulse bg-[var(--skeleton)] sm:h-44" />
                <div className="p-2.5 sm:p-3">
                  <div className="mb-2 h-3.5 w-3/4 rounded bg-[var(--skeleton)]/70" />
                  <div className="mb-2 h-3 w-1/2 rounded bg-[var(--skeleton)]/60" />
                  <div className="mb-3 h-3.5 w-1/3 rounded bg-[var(--skeleton)]/50" />

                  <p className="line-clamp-1 text-xs text-[var(--text-muted)]">{categoryText}</p>
                  <p className="mt-1 text-sm font-extrabold text-[var(--text)]">{priceLabel}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    );
  }

  return (
    <div
      aria-label="Loading home feed"
      className="mx-auto max-w-6xl px-4 py-6 text-xs text-[var(--text-muted)] sm:py-8 sm:text-sm"
    >
      Loading…
    </div>
  );
};

/** Dynamically import the real client with SSR disabled. */
const HomeClient = dynamic<HomeSeedProps>(
  () => import("./HomeClient").then((m: any) => m.default ?? m),
  {
    ssr: false,
    loading: LoadingHomeFeed,
  },
);

/** Properly typed wrapper that accepts seeds. */
export default function HomeClientNoSSR(props: HomeSeedProps) {
  return <HomeClient {...props} />;
}
