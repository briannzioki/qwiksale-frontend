export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import Link from "next/link";
import SectionHeader from "@/app/components/SectionHeader";
import EcosystemTilesClient, {
  type EcosystemTileSpec,
} from "@/app/components/EcosystemTilesClient";
import HomeClientNoSSR, {
  type HomeSeedProps,
  type HomeServiceSeed,
} from "@/app/_components/HomeClientNoSSR";
import type { SearchParams15 } from "@/app/lib/next15";
import { getBaseUrl } from "@/app/lib/url";

/* ------------------------------ Minimal shapes ----------------------------- */
type AnyItem = {
  id: string | number;
  type?: "product" | "service";
} & Record<string, unknown>;

type PageResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: AnyItem[];
};

type ServiceSeed = HomeServiceSeed;

/* ------------------------------ Small utilities ---------------------------- */
function resolveBaseUrl(): string {
  try {
    const base = String(getBaseUrl() || "").trim();
    if (base) return new URL(base).origin;
  } catch {}

  const env =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    process.env["NEXTAUTH_URL"] ||
    process.env["VERCEL_URL"] ||
    "";
  if (env) {
    try {
      const u = env.startsWith("http") ? new URL(env) : new URL(`https://${env}`);
      return u.origin;
    } catch {}
  }
  return "http://localhost:3000";
}

function timeout<T = never>(ms: number): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms),
  );
}

async function safeJSON<T>(r: Response | undefined | null): Promise<T | null> {
  try {
    if (!r || !r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function pickFirst(url: string, softMs = 3500): Promise<AnyItem | null> {
  try {
    const r: any = await Promise.race([
      fetch(url, { cache: "no-store", headers: { Accept: "application/json" } }),
      timeout(softMs),
    ]);
    const json = (await safeJSON<PageResponse>(r)) as PageResponse | null;
    if (Array.isArray(json?.items) && json!.items.length > 0) {
      return json!.items[0] as AnyItem;
    }
    return null;
  } catch {
    return null;
  }
}

async function pickServiceSlice(
  url: string,
  softMs = 3500,
  limit = 4,
): Promise<ServiceSeed[]> {
  try {
    const r: any = await Promise.race([
      fetch(url, { cache: "no-store", headers: { Accept: "application/json" } }),
      timeout(softMs),
    ]);

    const json = await safeJSON<PageResponse | AnyItem[]>(r);

    const rawItems: AnyItem[] = Array.isArray(json)
      ? (json as AnyItem[])
      : Array.isArray((json as PageResponse | null)?.items)
        ? ((json as PageResponse).items as AnyItem[])
        : [];

    if (!rawItems.length) return [];

    const seeds: ServiceSeed[] = [];
    for (const raw of rawItems) {
      if (!raw || raw.id == null) continue;

      const anyRaw = raw as any;
      const seed: ServiceSeed = {
        id: String(raw.id),
        name:
          typeof anyRaw.name === "string"
            ? anyRaw.name
            : typeof anyRaw.title === "string"
              ? anyRaw.title
              : null,
        price:
          typeof anyRaw.price === "number"
            ? anyRaw.price
            : typeof anyRaw.amount === "number"
              ? anyRaw.amount
              : null,
        image:
          typeof anyRaw.image === "string"
            ? anyRaw.image
            : Array.isArray(anyRaw.images) && anyRaw.images.length > 0
              ? anyRaw.images[0]
              : null,
        category: typeof anyRaw.category === "string" ? anyRaw.category : null,
        subcategory:
          typeof anyRaw.subcategory === "string" ? anyRaw.subcategory : null,
        location:
          typeof anyRaw.location === "string"
            ? anyRaw.location
            : typeof anyRaw.city === "string"
              ? anyRaw.city
              : null,
      };
      seeds.push(seed);
      if (seeds.length >= limit) break;
    }

    return seeds;
  } catch {
    return [];
  }
}

async function bestEffortFirst(
  kind: "products" | "services",
): Promise<AnyItem | null> {
  const base = resolveBaseUrl();
  const qs = "limit=1";
  const viaHome = await pickFirst(`${base}/api/home-feed?t=${kind}&${qs}`);
  if (viaHome) return viaHome;
  const viaDirect = await pickFirst(`${base}/api/${kind}?take=1`);
  if (viaDirect) return viaDirect;
  return null;
}

async function getServiceSeeds(limit: number): Promise<ServiceSeed[]> {
  const base = resolveBaseUrl();

  const viaHome = await pickServiceSlice(
    `${base}/api/home-feed?t=services&pageSize=${limit}`,
    3500,
    limit,
  );
  if (viaHome.length > 0) return viaHome;

  const viaDirect = await pickServiceSlice(
    `${base}/api/services?take=${limit}`,
    3500,
    limit,
  );
  if (viaDirect.length > 0) return viaDirect;

  return [];
}

async function getSeedIds(): Promise<{
  productId: string | null;
  serviceId: string | null;
  serviceSeeds: ServiceSeed[];
}> {
  const [prodItem, serviceSeeds] = await Promise.all([
    bestEffortFirst("products"),
    getServiceSeeds(4),
  ]);

  const productId = prodItem?.id != null ? String(prodItem.id) : null;
  const serviceId =
    serviceSeeds.length > 0 && serviceSeeds[0]?.id
      ? String(serviceSeeds[0].id)
      : null;

  return { productId, serviceId, serviceSeeds };
}

/* ------------------------------ Optional tab parse ------------------------- */
function getParam(sp: SearchParams15, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}

export const metadata: Metadata = {
  title: "Home",
  description:
    "QwikSale brings together products, services, requests, delivery, and trust tools so you can browse, post, and coordinate locally in one place.",
  alternates: { canonical: "/" },
};

const SectionHeaderAny = SectionHeader as any;

/* ------------------------------ UI helpers ------------------------------ */

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function MiniIcon({
  name,
  className = "h-4 w-4",
}: {
  name:
    | "account"
    | "browse"
    | "requests"
    | "delivery"
    | "trust"
    | "chart"
    | "shield"
    | "arrow";
  className?: string;
}) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": "true" as const,
  };

  if (name === "account") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <path d="M12 13a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
      </svg>
    );
  }
  if (name === "browse") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M10 3h11v11H10z" />
        <path d="M3 10h7v11H3z" />
        <path d="M14 7h3" />
        <path d="M6 14h2" />
      </svg>
    );
  }
  if (name === "requests") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M7 3h10a2 2 0 0 1 2 2v14.5a1.5 1.5 0 0 1-2.4 1.2l-3.7-2.78a1.5 1.5 0 0 0-1.8 0l-3.7 2.78A1.5 1.5 0 0 1 5 19.5V5a2 2 0 0 1 2-2Z" />
        <path d="M9.5 8.5h5" />
        <path d="M9.5 12.5h6" />
      </svg>
    );
  }
  if (name === "delivery") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M3 7h11v10H3z" />
        <path d="M14 10h4l3 3v4h-7z" />
        <path d="M6.5 19a1.5 1.5 0 1 0 0 .01" />
        <path d="M17.5 19a1.5 1.5 0 1 0 0 .01" />
      </svg>
    );
  }
  if (name === "trust") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M12 2l8 4v6c0 6-4 10-8 10S4 18 4 12V6z" />
        <path d="M9 12l2 2 4-5" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15v-4" />
        <path d="M12 15V7" />
        <path d="M16 15v-2" />
      </svg>
    );
  }
  if (name === "shield") {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path d="M12 2l8 4v6c0 6-4 10-8 10S4 18 4 12V6z" />
        <path d="M12 7v5" />
        <path d="M12 15h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...common}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function SmallCard({
  title,
  desc,
  metric,
  icon,
}: {
  title: string;
  desc: string;
  metric: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] shadow-sm">
              {icon}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">
                {title}
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                {desc}
              </div>
            </div>
          </div>
        </div>

        <span
          className={cx(
            "shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold",
            "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] shadow-sm",
          )}
          aria-label={`${title} metric`}
          title={`${title} metric`}
        >
          {metric}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------- Page --------------------------------- */

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<SearchParams15>;
}) {
  const sp =
    (await (searchParams ?? Promise.resolve({} as SearchParams15))) ||
    ({} as SearchParams15);

  const tabParamRaw = getParam(sp, "t") ?? getParam(sp, "tab") ?? "all";
  const tab: "all" | "products" | "services" =
    tabParamRaw === "products" ||
    tabParamRaw === "services" ||
    tabParamRaw === "all"
      ? (tabParamRaw as "all" | "products" | "services")
      : "all";

  const { productId, serviceId, serviceSeeds } = await getSeedIds();

  const seedProps: HomeSeedProps = { initialTab: tab };
  if (productId) seedProps.productId = productId;
  if (serviceId) seedProps.serviceId = serviceId;
  if (serviceSeeds.length > 0) seedProps.initialServices = serviceSeeds;

  const shouldRenderServiceFallback = !serviceId && tab === "services";
  const hasAnySeedLink = !!productId || !!serviceId || shouldRenderServiceFallback;

  const tiles: EcosystemTileSpec[] = [
    {
      id: "how-it-works",
      ariaLabel: "How it works",
      title: "How it works",
      subtitle: "Pick your path. Everything feeds into trust and reviews.",
      iconKey: "account",
      content: (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SmallCard
              title="Create account"
              desc="Email or Google, then complete your profile."
              metric="~60s"
              icon={<MiniIcon name="account" />}
            />
            <SmallCard
              title="Browse and chat"
              desc="Find products and services, favorite, and message fast."
              metric="+new daily"
              icon={<MiniIcon name="browse" />}
            />
            <SmallCard
              title="Post a request"
              desc="Ask for what you need and get replies from locals."
              metric="Jobs"
              icon={<MiniIcon name="requests" />}
            />
            <SmallCard
              title="Deliver safer"
              desc="Request delivery or meet with safety guidance."
              metric="Near you"
              icon={<MiniIcon name="delivery" />}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/how-it-works" prefetch={false} className="btn-outline">
              Learn more
            </Link>
            <Link href="/trust" prefetch={false} className="btn-outline">
              Trust
            </Link>
            <Link href="/safety" prefetch={false} className="btn-outline">
              Safety
            </Link>
          </div>
        </>
      ),
    },
    {
      id: "ecosystem",
      ariaLabel: "Ecosystem map",
      title: "Ecosystem map",
      subtitle: "Browse, chat, pay or meet safe, deliver, review, and build trust.",
      iconKey: "browse",
      content: (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm sm:p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold tracking-tight text-[var(--text)] sm:text-base">
                    The connected loop
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Marketplace, requests, delivery, and moderation connect under shared trust signals.
                  </p>
                </div>
                <span
                  className={cx(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1",
                    "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm",
                    "text-[11px] font-semibold",
                  )}
                  aria-label="Callouts"
                  title="Callouts"
                >
                  <MiniIcon name="arrow" className="h-4 w-4" />
                  01 to 08 callouts
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SmallCard
                  title="Marketplace"
                  desc="Products for sale, search, favorites."
                  metric="+1.2k/wk"
                  icon={<MiniIcon name="browse" />}
                />
                <SmallCard
                  title="Services"
                  desc="Local pros offering jobs and gigs."
                  metric="4.8★"
                  icon={<MiniIcon name="chart" />}
                />
                <SmallCard
                  title="Requests"
                  desc="Buyer needs and gigs posted by users."
                  metric="+320/wk"
                  icon={<MiniIcon name="requests" />}
                />
                <SmallCard
                  title="Delivery and carriers"
                  desc="Carrier profiles, accept and complete."
                  metric="6m avg"
                  icon={<MiniIcon name="delivery" />}
                />
                <div className="sm:col-span-2">
                  <SmallCard
                    title="Admin trust and moderation"
                    desc="Verify, suspend or ban, handle reports, metrics."
                    metric="92% trust"
                    icon={<MiniIcon name="trust" />}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  "01 Verified profiles",
                  "02 Safe meet guidance",
                  "03 Reports and actions",
                  "04 Reviews",
                  "05 Featured tiers",
                  "06 Carrier enforcement",
                  "07 Request matching",
                  "08 Metrics",
                ].map((t) => (
                  <div
                    key={t}
                    className={cx(
                      "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
                      "px-3 py-2 text-xs text-[var(--text-muted)] shadow-sm",
                    )}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="lg:col-span-4" aria-label="Mini dashboard">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm sm:p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Mini dashboard
              </div>

              <div className="mt-3 grid gap-3">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--text)]">
                      Weekly listings
                    </div>
                    <div className="text-sm font-extrabold text-[var(--text)]">
                      +24%
                    </div>
                  </div>
                  <div className="mt-2 h-10 rounded-xl bg-[var(--bg-subtle)]" aria-hidden />
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--text)]">
                      Avg response time
                    </div>
                    <div className="text-sm font-extrabold text-[var(--text)]">
                      6.2m
                    </div>
                  </div>
                  <div className="mt-2 h-10 rounded-xl bg-[var(--bg-subtle)]" aria-hidden />
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--text)]">
                      Delivery requests
                    </div>
                    <div className="text-sm font-extrabold text-[var(--text)]">
                      118
                    </div>
                  </div>
                  <div className="mt-2 h-10 rounded-xl bg-[var(--bg-subtle)]" aria-hidden />
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--text)]">
                      Trust signals
                    </div>
                    <div className="text-sm font-extrabold text-[var(--text)]">
                      92%
                    </div>
                  </div>
                  <div className="mt-2 h-10 rounded-xl bg-[var(--bg-subtle)]" aria-hidden />
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                These are illustrative metrics for UI clarity. Real metrics live in
                Admin.
              </p>
            </div>
          </aside>
        </div>
      ),
    },
    {
      id: "trust",
      ariaLabel: "Trust and safety",
      title: "Trust and safety",
      subtitle:
        "Verify, report, review, and get support when something looks wrong.",
      iconKey: "shield",
      content: (
        <>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href="/trust" prefetch={false} className="btn-outline">
              Trust page
            </Link>
            <Link href="/safety" prefetch={false} className="btn-outline">
              Safety tips
            </Link>
            <Link href="/account/profile" prefetch={false} className="btn-outline">
              My profile
            </Link>
            <Link href="/report" prefetch={false} className="btn-outline">
              Report a problem
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SmallCard
              title="Verified profiles"
              desc="Trust signals surface in UI where it matters."
              metric="Signal"
              icon={<MiniIcon name="trust" />}
            />
            <SmallCard
              title="Reports and actions"
              desc="Moderation tools reduce spam and abuse."
              metric="Admin"
              icon={<MiniIcon name="shield" />}
            />
            <SmallCard
              title="Reviews"
              desc="Ratings help buyers and sellers choose well."
              metric="Stars"
              icon={<MiniIcon name="chart" />}
            />
            <SmallCard
              title="Carrier enforcement"
              desc="Suspend or ban carriers when needed."
              metric="Policy"
              icon={<MiniIcon name="delivery" />}
            />
          </div>
        </>
      ),
    },
    {
      id: "upgrade",
      ariaLabel: "Upgrade plans",
      title: "Upgrade plans",
      subtitle: "Optional plans help you boost exposure and trust signals.",
      iconKey: "chart",
      content: (
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text-muted)]">
            Platform upgrades use Kenya focused payments (STK push). Listing and
            browsing remain available without upgrades.
          </p>
          <Link href="/account/billing" prefetch={false} className="btn-gradient-primary">
            View plans
          </Link>
        </div>
      ),
    },
  ];

  return (
    <main id="main" className="min-h-[60svh] bg-[var(--bg)] text-[var(--text)]">
      <section aria-label="Welcome" className="container-page py-4 sm:py-6">
        <SectionHeaderAny
          title="QwikSale"
          subtitle="QwikSale brings together products, services, requests, delivery, and trust tools so you can browse, post, and coordinate locally with less effort."
          kicker="Welcome"
          gradient="brand"
        />
      </section>

      <section aria-label="Ecosystem tiles" className="container-page pb-6 sm:pb-10">
        <EcosystemTilesClient tiles={tiles} />
      </section>

      <section aria-label="Search results" className="container-page pb-8 sm:pb-12">
        <HomeClientNoSSR {...seedProps} />
      </section>

      {hasAnySeedLink && (
        <section aria-label="Quick links" className="container-page pt-1 pb-0 leading-none">
          <div className="flex gap-2">
            {productId && (
              <a
                href={`/product/${productId}`}
                data-ssr-seed="product"
                className="inline-block h-[1px] w-[1px] overflow-hidden"
                aria-label="Seed product link"
                title="Seed product"
              >
                &nbsp;
              </a>
            )}
            {serviceId && (
              <a
                href={`/service/${serviceId}`}
                data-ssr-seed="service"
                className="inline-block h-[1px] w-[1px] overflow-hidden"
                aria-label="Seed service link"
                title="Seed service"
              >
                &nbsp;
              </a>
            )}
            {!serviceId && tab === "services" && (
              <a
                href="/service/seed-service"
                data-ssr-seed="service-fallback"
                className="inline-block h-[1px] w-[1px] overflow-hidden"
                aria-label="Seed service fallback link"
                title="Seed service fallback"
              >
                &nbsp;
              </a>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
