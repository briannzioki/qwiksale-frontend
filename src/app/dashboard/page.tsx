// src/app/dashboard/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import UserAvatar from "@/app/components/UserAvatar";
import ListingCard from "@/app/components/ListingCard";
import { getSessionUser } from "@/app/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Dashboard · QwikSale",
  description: "Your QwikSale account overview, listings, and insights.",
  robots: { index: false, follow: false },
};

type Me = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  subscription: string | null;
};

type DashboardListing = {
  type: "product" | "service";
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  location: string | null;
  createdAt: string; // ISO
};

type ProductRowDash = {
  id: string;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  location: string | null;
  createdAt: Date | string | null;
};

type ServiceRowDash = {
  id: string | number;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  location: string | null;
  createdAt: Date | string | null;
};

function fmtInt(n: number) {
  const val = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("en-KE").format(val);
  } catch {
    return String(val);
  }
}

const FALLBACK_IMG = "/placeholder/default.jpg";

function toIso(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  const ts = Date.parse(s);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : "";
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  const t = new Promise<T>((resolve) => {
    tid = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.catch(() => fallback), t]).finally(() => {
    if (tid) clearTimeout(tid);
  }) as Promise<T>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const rawSp = (await searchParams) ?? {};
    const sp = rawSp as Record<string, string | string[] | undefined>;

    // E2E flag detection – be generous about how the flag is passed
    const directFlag =
      (Array.isArray(sp["__e2e"]) ? sp["__e2e"][0] : sp["__e2e"]) ??
      (Array.isArray(sp["e2e_dashboard_error"])
        ? sp["e2e_dashboard_error"][0]
        : sp["e2e_dashboard_error"]) ??
      (Array.isArray(sp["e2e"]) ? sp["e2e"][0] : sp["e2e"]) ??
      null;

    const allValues: string[] = [];
    for (const val of Object.values(sp)) {
      if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === "string") allValues.push(v);
        }
      } else if (typeof val === "string") {
        allValues.push(val);
      }
    }

    const lowerValues = allValues.map((v) => v.toLowerCase());
    const directLower =
      typeof directFlag === "string" ? directFlag.toLowerCase() : "";

    const e2eFlag =
      directLower === "dashboard_error" ||
      directLower === "dashboard-error" ||
      lowerValues.includes("dashboard_error") ||
      lowerValues.includes("dashboard-error");

    if (e2eFlag) {
      // Explicit soft-error surface for guardrail tests
      return (
        <main
          className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16"
          data-soft-error="dashboard"
          data-e2e="dashboard-soft-error"
        >
          <div className="mx-auto max-w-6xl">
            <h1 className="text-xl font-semibold">We hit a dashboard error</h1>
            <p className="mt-2 text-sm opacity-80">
              This is a simulated soft error for guardrail testing. You can
              refresh or navigate away.
            </p>
            <div className="mt-3 flex gap-2">
              <Link href="/dashboard" prefetch={false} className="btn-outline">
                Retry
              </Link>
              <Link href="/" prefetch={false} className="btn-outline">
                Home
              </Link>
              <Link href="/help" prefetch={false} className="btn-outline">
                Help Center
              </Link>
            </div>
          </div>
        </main>
      );
    }

    // Server-side cookie hint
    const cookieStore = await cookies();
    const hasAuthCookie = cookieStore.getAll().some((c) => {
      const name = (c.name ?? "").toLowerCase();
      return (
        name === "next-auth.session-token" ||
        name === "__secure-next-auth.session-token" ||
        name.startsWith("next-auth.session-token.") ||
        (name.includes("auth") && name.includes("session"))
      );
    });

    const viewer = await getSessionUser();
    const userId: string | null =
      viewer?.id != null ? String(viewer.id) : null;

    const isGuest = !userId && !hasAuthCookie;
    const isAuthedOrHinted = !!userId || hasAuthCookie;

    // True guest / unauthenticated: soft CTA instead of redirect
    if (isGuest) {
      return (
        <main className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16">
          <div
            className="mx-auto flex max-w-6xl flex-col gap-4"
            data-e2e="dashboard-guest"
          >
            <h1 className="text-2xl font-bold md:text-3xl">Dashboard</h1>
            <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm">
                Something went wrong loading your dashboard or your session has
                expired. Please{" "}
                <Link
                  href="/signin?callbackUrl=%2Fdashboard"
                  prefetch={false}
                  className="underline"
                >
                  sign in
                </Link>{" "}
                to view your dashboard.
              </p>
            </div>
          </div>
        </main>
      );
    }

    // Limbo state: cookies say "authed" but we have no userId.
    if (!userId && hasAuthCookie) {
      return (
        <main
          className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16"
          data-soft-error="dashboard"
          data-e2e="dashboard-soft-error"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4">
            <h1 className="text-2xl font-bold md:text-3xl">Dashboard</h1>
            <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm">
                We couldn&apos;t fully load your account details right now, but
                your session appears to be active. Please refresh this page or
                navigate to another section; your account menu in the header
                should remain available.
              </p>
            </div>
          </div>
        </main>
      );
    }

    // At this point we have a concrete userId.
    const concreteUserId = userId as string;

    const { prisma } = await import("@/app/lib/prisma");
    const me = await withTimeout<Me | null>(
      prisma.user
        .findUnique({
          where: { id: concreteUserId },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            subscription: true,
          },
        })
        .catch(() => null),
      800,
      null,
    );

    // Data soft error (no user row / timeout)
    if (!me) {
      if (isAuthedOrHinted) {
        return (
          <main
            className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16"
            data-soft-error="dashboard"
            data-e2e="dashboard-soft-error"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-4">
              <h1 className="text-2xl font-bold md:text-3xl">Dashboard</h1>
              <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm">
                  We couldn&apos;t load your account details. Your session
                  appears to be active, but the dashboard data failed to load.
                  Please refresh this page. If this keeps happening, contact
                  support.
                </p>
              </div>
            </div>
          </main>
        );
      }

      return (
        <main
          className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16"
          data-soft-error="dashboard"
          data-e2e="dashboard-soft-error"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4">
            <h1 className="text-2xl font-bold md:text-3xl">Dashboard</h1>
            <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm">
                We couldn&apos;t load your account. Please{" "}
                <Link
                  href="/signin?callbackUrl=%2Fdashboard"
                  prefetch={false}
                  className="underline"
                >
                  sign in
                </Link>{" "}
                again.
              </p>
            </div>
          </div>
        </main>
      );
    }

    // ---- My listings metrics + recent listings (products + services) ----
    const now = new Date();
    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    );

    const anyPrisma = prisma as any;
    const ServiceModel = anyPrisma.service ?? anyPrisma.services ?? null;

    const [
      productCount,
      serviceCount,
      recentProductCount,
      recentServiceCount,
      recentProductsRaw,
      recentServicesRaw,
    ] = await Promise.all([
      withTimeout(
        prisma.product.count({
          where: { sellerId: concreteUserId },
        }),
        800,
        0,
      ),
      ServiceModel
        ? withTimeout(
            ServiceModel.count({
              where: { sellerId: concreteUserId },
            }),
            800,
            0,
          )
        : Promise.resolve(0),
      withTimeout(
        prisma.product.count({
          where: {
            sellerId: concreteUserId,
            createdAt: { gte: sevenDaysAgo },
          },
        }),
        800,
        0,
      ),
      ServiceModel
        ? withTimeout(
            ServiceModel.count({
              where: {
                sellerId: concreteUserId,
                createdAt: { gte: sevenDaysAgo },
              },
            }),
            800,
            0,
          )
        : Promise.resolve(0),
      withTimeout(
        prisma.product.findMany({
          where: { sellerId: concreteUserId },
          select: {
            id: true,
            name: true,
            category: true,
            subcategory: true,
            price: true,
            image: true,
            location: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 6,
        }),
        800,
        [] as ProductRowDash[],
      ),
      ServiceModel
        ? withTimeout(
            ServiceModel.findMany({
              where: { sellerId: concreteUserId },
              select: {
                id: true,
                name: true,
                category: true,
                subcategory: true,
                price: true,
                image: true,
                location: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
              take: 6,
            }),
            800,
            [] as ServiceRowDash[],
          )
        : Promise.resolve([] as ServiceRowDash[]),
    ]);

    const recentListings: DashboardListing[] = [
      ...(recentProductsRaw as ProductRowDash[]).map(
        (p): DashboardListing => ({
          type: "product",
          id: String(p.id),
          name: p.name || "Untitled",
          category: p.category ?? null,
          subcategory: p.subcategory ?? null,
          price: typeof p.price === "number" ? p.price : null,
          image: p.image ?? null,
          location: p.location ?? null,
          createdAt: toIso(p.createdAt),
        }),
      ),
      ...(recentServicesRaw as ServiceRowDash[]).map(
        (s): DashboardListing => ({
          type: "service",
          id: String(s.id),
          name: s.name || "Untitled",
          category: s.category ?? null,
          subcategory: s.subcategory ?? null,
          price: typeof s.price === "number" ? s.price : null,
          image: s.image ?? null,
          location: s.location ?? null,
          createdAt: toIso(s.createdAt),
        }),
      ),
    ]
      .sort((a, b) => {
        const da = Date.parse(a.createdAt || "");
        const db = Date.parse(b.createdAt || "");
        if (db !== da) return db - da;
        // tie-break on type+id for stability
        return `${b.type}-${b.id}`.localeCompare(`${a.type}-${a.id}`);
      })
      .slice(0, 6);

    const myListingsCount = productCount + serviceCount;
    const newLast7Days = recentProductCount + recentServiceCount;

    // Favorites metrics still default to 0 for now
    const favoritesCount = 0;
    const likesOnMyListings = 0;

    const subLabel = (me.subscription ?? "FREE").toUpperCase();

    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          {/* Page title + hero */}
          <header className="flex flex-col gap-4">
            <h1 className="text-2xl font-bold md:text-3xl">Dashboard</h1>

            <section
              aria-label="Account overview"
              className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#161748] via-[#1b244f] to-[#39a0ca] p-6 shadow-lg shadow-black/25 ring-1 ring-white/10"
            >
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <UserAvatar
                    src={me.image ?? undefined}
                    alt={me.name || me.email || "You"}
                    size={56}
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-100/80">
                      Welcome 👋
                    </p>
                    <p className="text-xl font-semibold text-white md:text-2xl">
                      {me.name || me.email || "Your QwikSale dashboard"}
                    </p>
                    <p className="mt-1 text-sm text-slate-100/80">
                      Manage your listings, favorites, and account.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 md:items-end">
                  <span className="inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-1 text-xs font-medium text-slate-50">
                    <span
                      className="h-2 w-2 rounded-full bg-emerald-400"
                      aria-hidden="true"
                    />
                    <span>Subscription:</span>
                    <span className="font-semibold">{subLabel}</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/account/profile"
                      prefetch={false}
                      className="btn-gradient-primary text-xs md:text-sm"
                      title="Edit account"
                    >
                      Edit Account
                    </Link>
                    {subLabel === "FREE" && (
                      <Link
                        href="/settings/billing"
                        prefetch={false}
                        className="btn-gradient-accent text-xs md:text-sm"
                      >
                        Upgrade
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Hero actions row */}
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/sell"
                  prefetch={false}
                  className="btn-outline bg-white/10 text-sm text-slate-50 hover:bg-white/20"
                >
                  + Post a Listing
                </Link>
                <Link
                  href="/saved"
                  prefetch={false}
                  className="btn-outline bg-white/5 text-sm text-slate-50 hover:bg-white/15"
                >
                  View Saved
                </Link>
                <Link
                  href="/settings/billing"
                  prefetch={false}
                  className="btn-outline bg-white/5 text-sm text-slate-50 hover:bg-white/15"
                >
                  Billing &amp; Subscription
                </Link>
                <a
                  href="/api/auth/signout"
                  className="btn-outline ml-auto bg-black/30 text-sm text-slate-50 hover:bg-black/40"
                  rel="nofollow"
                >
                  Sign out
                </a>
              </div>
            </section>
          </header>

          {/* Metrics row */}
          <section
            aria-label="Dashboard summary"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Metric title="My Listings" value={myListingsCount} />
            <Metric title="My Favorites" value={favoritesCount} />
            <Metric title="New in last 7 days" value={newLast7Days} />
            <Metric title="Likes on my listings" value={likesOnMyListings} />
          </section>

          {/* Recent listings */}
          <section className="space-y-3" aria-label="Your recent listings">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Your Recent Listings</h2>
              <Link
                href="/sell"
                prefetch={false}
                className="text-sm text-[#39a0ca] underline"
              >
                Post another →
              </Link>
            </div>

            {recentListings.length === 0 ? (
              <div className="rounded-2xl border bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/illustrations/empty-box.svg"
                  alt=""
                  className="mx-auto h-24 w-24 opacity-90"
                />
                <p className="mt-3 text-lg font-semibold text-gray-700 dark:text-slate-200">
                  No listings yet
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  Post your first item to get started.
                </p>
                <div className="mt-4">
                  <Link
                    href="/sell"
                    prefetch={false}
                    className="btn-gradient-primary"
                  >
                    Post a Listing
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recentListings.map((item) => (
                  <RecentListingCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  } catch (err: unknown) {
    // Fatal SSR error → soft error UI instead of bubbling a 500
    // eslint-disable-next-line no-console
    console.error("[dashboard SSR fatal]", err);
    return (
      <main
        className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16"
        data-soft-error="dashboard"
        data-e2e="dashboard-soft-error"
      >
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-semibold">We hit a dashboard error</h1>
          <p className="mt-2 text-sm opacity-80">
            Something went wrong loading your dashboard. Please refresh. If this
            continues, contact support — the error has been logged.
          </p>
          <div className="mt-3">
            <Link href="/dashboard" prefetch={false} className="btn-outline">
              Retry
            </Link>
          </div>
        </div>
      </main>
    );
  }
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-sm text-gray-500 dark:text-slate-400">{title}</div>
      <div className="text-2xl font-bold text-[#161748] dark:text-white">
        {fmtInt(value)}
      </div>
    </div>
  );
}

function RecentListingCard({ item }: { item: DashboardListing }) {
  const href =
    item.type === "service"
      ? `/service/${encodeURIComponent(item.id)}`
      : `/product/${encodeURIComponent(item.id)}`;

  const editHref =
    item.type === "service"
      ? `/service/${encodeURIComponent(item.id)}/edit`
      : `/product/${encodeURIComponent(item.id)}/edit`;

  return (
    <ListingCard
      id={item.id}
      href={href}
      title={item.name}
      price={typeof item.price === "number" ? item.price : "Contact for price"}
      currency="KES"
      imageUrl={item.image || FALLBACK_IMG}
      location={item.location || "Kenya"}
      kind={item.type}
      editHref={editHref}
    />
  );
}
