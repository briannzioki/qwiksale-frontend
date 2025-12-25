// src/app/dashboard/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import UserAvatar from "@/app/components/UserAvatar";
import ListingCard from "@/app/components/ListingCard";
import { getSessionUser } from "@/app/lib/authz";
import {
  getSellerDashboardSummary,
  fmtInt,
  type DashboardListing,
} from "@/app/lib/dashboard";
import DashboardCharts from "./_components/DashboardCharts";
import DashboardMetrics from "./_components/DashboardMetrics";
import DashboardMessagesPreview from "./_components/DashboardMessagesPreview";
import ProfileCompletionCard, {
  type ProfileCompletion,
} from "./_components/ProfileCompletionCard";

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
  id: string | null;
  name: string | null;
  email: string | null;
  image: string | null;
  subscription: string | null;
  username: string | null;
  emailVerified: Date | string | null;
};

type DashboardChartPoint = {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Dec 10"
  listings: number;
  messages: number;
};

const DASHBOARD_CHART_DAYS = 7;
const FALLBACK_IMG = "/placeholder/default.jpg";

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
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

function isVerifiedEmail(value: unknown): boolean {
  if (!value) return false;
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function computeProfileCompletion(input: {
  username?: string | null;
  emailVerified?: unknown;
}): ProfileCompletion {
  const missingFields: Array<"username" | "emailVerified"> = [];

  const u = typeof input.username === "string" ? input.username.trim() : "";
  if (!u) missingFields.push("username");

  if (!isVerifiedEmail(input.emailVerified)) missingFields.push("emailVerified");

  const total = 2;
  const done = total - missingFields.length;
  const percent = Math.max(0, Math.min(100, Math.round((done / total) * 100)));

  return { percent, missingFields };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const rawSp = (await searchParams) ?? {};
    const sp = rawSp as Record<string, string | string[] | undefined>;

    // E2E flag detection - be generous about how the flag is passed
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

    const btnBase =
      "inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-soft transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm";

    if (e2eFlag) {
      // Explicit soft-error surface for guardrail tests
      return (
        <main
          id="main"
          className="min-h-[calc(100vh-4rem)] bg-[var(--bg)] px-4 py-4 text-[var(--text)] sm:py-6 md:px-8 lg:px-12 xl:px-16"
          data-soft-error="dashboard"
          data-e2e="dashboard-soft-error"
        >
          <div className="mx-auto max-w-6xl">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl">
              We hit a dashboard error
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
              This is a simulated soft error for guardrail testing. You can
              refresh or navigate away.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/dashboard" prefetch={false} className={btnBase}>
                Retry
              </Link>
              <Link href="/" prefetch={false} className={btnBase}>
                Home
              </Link>
              <Link href="/help" prefetch={false} className={btnBase}>
                Help Center
              </Link>
            </div>
          </div>
        </main>
      );
    }

    // Cookie heuristics - detect presence of any NextAuth session cookie.
    const cookieStore = await cookies();
    const hasAuthCookie = cookieStore.getAll().some((c: { name?: string }) => {
      const name = (c.name ?? "").toLowerCase();
      return (
        name === "next-auth.session-token" ||
        name === "__secure-next-auth.session-token" ||
        name.startsWith("next-auth.session-token.") ||
        (name.includes("auth") && name.includes("session"))
      );
    });

    // Canonical auth check - rely on the session.
    const viewer = await getSessionUser();
    const viewerAny = (viewer ?? {}) as any;

    const sessionId =
      viewerAny && viewerAny.id != null ? String(viewerAny.id) : null;
    const sessionEmail =
      typeof viewerAny?.email === "string" ? viewerAny.email : null;

    const hasSessionIdentity = Boolean(sessionId || sessionEmail);

    // No session identity - distinguish between *true guest* and *limbo*.
    if (!hasSessionIdentity) {
      // Limbo: we see an auth cookie but no session identity.
      // For guardrail / "no auto-logout" semantics, do NOT show a Sign in CTA here.
      if (hasAuthCookie) {
        return (
          <main
            id="main"
            className="min-h-[calc(100vh-4rem)] bg-[var(--bg)] px-4 py-4 text-[var(--text)] sm:py-6 md:px-8 lg:px-12 xl:px-16"
            data-soft-error="dashboard"
            data-e2e="dashboard-soft-error"
          >
            <div className="mx-auto max-w-6xl">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl">
                Dashboard
              </h1>
              <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:mt-4 sm:p-5">
                <h2 className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
                  We couldn&apos;t load your dashboard
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
                  Your session appears to be active, but we couldn&apos;t load
                  your dashboard right now. Please refresh this page or navigate
                  to another section. Your account menu in the header should
                  remain available.
                </p>
              </div>
            </div>
          </main>
        );
      }

      // True guest / unauthenticated: soft CTA with non-ambiguous button label.
      return (
        <main
          id="main"
          className="min-h-[calc(100vh-4rem)] bg-[var(--bg)] px-4 py-4 text-[var(--text)] sm:py-6 md:px-8 lg:px-12 xl:px-16"
        >
          <div
            className="mx-auto flex max-w-6xl flex-col gap-4"
            data-e2e="dashboard-guest"
          >
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl">
              Dashboard
            </h1>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5">
              <p className="text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
                You&apos;re not signed in or your session has expired.{" "}
                <Link
                  href="/signin?callbackUrl=/dashboard"
                  prefetch={false}
                  className="font-semibold text-[var(--text)] underline underline-offset-4 decoration-[var(--border)] hover:decoration-[var(--text)]"
                >
                  Sign in to view your dashboard
                </Link>
                .
              </p>
            </div>
          </div>
        </main>
      );
    }

    const { prisma } = await import("@/app/lib/prisma");

    const fallbackMe: Me = {
      id: sessionId,
      name: typeof viewerAny?.name === "string" ? viewerAny.name : null,
      email: sessionEmail,
      image: typeof viewerAny?.image === "string" ? viewerAny.image : null,
      subscription: null,
      username:
        typeof viewerAny?.username === "string" ? viewerAny.username : null,
      emailVerified:
        typeof viewerAny?.emailVerified === "string"
          ? viewerAny.emailVerified
          : null,
    };

    // User row fetch with timeout + safe fallback. Try by id first, then email.
    const me = await withTimeout<Me>(
      (async () => {
        if (sessionId) {
          const byId = await prisma.user.findUnique({
            where: { id: sessionId },
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              subscription: true,
              username: true,
              emailVerified: true,
            },
          });
          if (byId) return byId as Me;
        }

        if (sessionEmail) {
          const byEmail = await prisma.user.findUnique({
            where: { email: sessionEmail },
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              subscription: true,
              username: true,
              emailVerified: true,
            },
          });
          if (byEmail) return byEmail as Me;
        }

        return fallbackMe;
      })().catch(() => fallbackMe),
      800,
      fallbackMe,
    );

    const dashboardUserId = me.id ?? sessionId ?? null;

    // ---- Seller dashboard summary (metrics + inbox + recent listings) ----
    const emptySummary: Awaited<ReturnType<typeof getSellerDashboardSummary>> = {
      metrics: {
        myListingsCount: 0,
        favoritesCount: 0,
        newLast7Days: 0,
        likesOnMyListings: 0,
        productsCount: 0,
        servicesCount: 0,
        newProductsLast7Days: 0,
        newServicesLast7Days: 0,
      },
      inbox: {
        unreadThreads: 0,
        newMessagesLast7Days: 0,
        totalThreads: 0,
        recentThreads: [],
        dailyMessageCounts: [],
      },
      recentListings: [],
    };

    const summary = dashboardUserId
      ? await withTimeout(
          getSellerDashboardSummary(dashboardUserId, {
            listingsLimit: 6,
            windowDays: DASHBOARD_CHART_DAYS,
          }),
          800,
          emptySummary,
        )
      : emptySummary;

    const metrics = summary?.metrics ?? emptySummary.metrics;
    const inboxSummary = summary?.inbox ?? emptySummary.inbox;
    const recentListings =
      summary?.recentListings ?? emptySummary.recentListings;

    const myListingsCount = metrics.myListingsCount ?? 0;
    const favoritesCount = metrics.favoritesCount ?? 0;
    const newLast7Days = metrics.newLast7Days ?? 0;
    const likesOnMyListings = metrics.likesOnMyListings ?? 0;

    // ---- Profile completion payload (single server-side source of truth) ----
    const profileCompletion = computeProfileCompletion({
      username: me.username,
      emailVerified: me.emailVerified,
    });

    const completeProfileHref = `/account/complete-profile?next=${encodeURIComponent(
      "/dashboard",
    )}`;

    // ---- Build 7-day chart data (listings per day + messages per day) ----
    const now = new Date();
    const listingCountsByDay: Record<string, number> = {};

    for (const item of recentListings) {
      const d = toDateOrNull(item.createdAt);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      listingCountsByDay[key] = (listingCountsByDay[key] ?? 0) + 1;
    }

    const messageCountsByDay: Record<string, number> = {};
    for (const pt of inboxSummary.dailyMessageCounts ?? []) {
      if (!pt) continue;
      const key = pt.date;
      const count = pt.count;
      if (!key || typeof count !== "number") continue;
      messageCountsByDay[key] = count;
    }

    const chartPoints: DashboardChartPoint[] = [];
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let offset = DASHBOARD_CHART_DAYS - 1; offset >= 0; offset--) {
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - offset,
      );
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-KE", {
        month: "short",
        day: "numeric",
      });

      chartPoints.push({
        date: key,
        label,
        listings: listingCountsByDay[key] ?? 0,
        messages: messageCountsByDay[key] ?? 0,
      });
    }

    const subLabel = (me.subscription ?? "FREE").toUpperCase();
    const displayName = me.name || me.email || "there";

    return (
      <main
        id="main"
        className="min-h-[calc(100vh-4rem)] bg-[var(--bg)] px-4 py-4 text-[var(--text)] sm:py-6 md:px-8 lg:px-12 xl:px-16"
      >
        <section
          className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6"
          data-e2e="dashboard-auth"
        >
          {/* Page title + hero */}
          <header className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl">
                Dashboard
              </h1>
              <span className="hidden text-xs font-semibold uppercase tracking-[0.25em] text-[var(--text-muted)] md:inline">
                Overview
              </span>
            </div>

            <section
              aria-label="Account overview"
              className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] p-4 text-white shadow-soft sm:p-6"
            >
              <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
                <div className="flex items-center gap-3 sm:gap-4">
                  <UserAvatar
                    src={me.image ?? undefined}
                    alt={me.name || me.email || "You"}
                    size={56}
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/75">
                      Welcome back
                    </p>
                    <p className="mt-1 text-lg font-extrabold tracking-tight sm:text-xl md:text-2xl">
                      Hey, <span className="text-white">{displayName}</span>.
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/85 sm:text-sm">
                      Quick snapshot of your listings, favorites, and messages
                      on QwikSale.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-1.5 md:items-end md:gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    <span
                      className="h-2 w-2 rounded-full bg-white/80"
                      aria-hidden="true"
                    />
                    <span>Plan:</span>
                    <span className="font-extrabold">{subLabel}</span>
                  </span>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/account/profile"
                      prefetch={false}
                      className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/15 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/20 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus md:text-sm"
                      title="Edit account"
                    >
                      Edit Account
                    </Link>

                    {subLabel === "FREE" && (
                      <Link
                        href="/settings/billing"
                        prefetch={false}
                        className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus md:text-sm"
                      >
                        Upgrade
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Hero primary actions */}
              <div className="relative mt-3 flex flex-nowrap gap-2 overflow-x-auto whitespace-nowrap pb-1 [-webkit-overflow-scrolling:touch] sm:mt-5 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:pb-0">
                <Link
                  href="/sell"
                  prefetch={false}
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/15 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/20 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm"
                >
                  + Post a Listing
                </Link>
                <Link
                  href="/saved"
                  prefetch={false}
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm"
                >
                  View Saved
                </Link>
                <Link
                  href="/settings/billing"
                  prefetch={false}
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm"
                >
                  Billing &amp; Subscription
                </Link>
                <a
                  href="/api/auth/signout"
                  className="sm:ml-auto inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/15 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/20 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm"
                  rel="nofollow"
                >
                  Sign out
                </a>
              </div>

              {/* High-level snapshot chips */}
              <div className="relative mt-3 flex flex-nowrap gap-2 overflow-x-auto whitespace-nowrap pb-1 text-[11px] text-white/85 [-webkit-overflow-scrolling:touch] sm:mt-4 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:pb-0 sm:text-xs">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/75" />
                  <span>{fmtInt(myListingsCount)} active listing(s)</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/75" />
                  <span>{fmtInt(favoritesCount)} item(s) in favorites</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/75" />
                  <span>{fmtInt(newLast7Days)} new in the last 7 days</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/75" />
                  <span>
                    {fmtInt(likesOnMyListings)} like(s) on your listings
                  </span>
                </div>
              </div>
            </section>

            {/* Required UX: banner when profile is incomplete (username/email verification) */}
            {profileCompletion.missingFields.length > 0 && (
              <div
                role="alert"
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4 md:p-5"
                data-testid="dashboard-complete-profile-banner"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-extrabold tracking-tight text-[var(--text)] sm:text-base">
                      Complete profile
                    </div>
                    <div className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)] sm:text-sm">
                      Finish setting up your account to get the best experience
                      on QwikSale.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={completeProfileHref}
                      prefetch={false}
                      className="inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-soft transition hover:bg-[var(--bg-elevated)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus md:text-sm"
                      data-testid="dashboard-complete-profile-cta"
                    >
                      Complete profile
                    </Link>
                    <Link
                      href="/account/profile"
                      prefetch={false}
                      className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-soft transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus md:text-sm"
                    >
                      Edit Account
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Required UX: profile completion progress card */}
            <ProfileCompletionCard
              completion={profileCompletion}
              href={completeProfileHref}
            />
          </header>

          {/* Main dashboard content */}
          <div className="flex flex-col gap-4 sm:gap-5">
            {/* Dashboard summary / metrics */}
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4 md:p-6">
              {/* The only ARIA region named "Dashboard summary" is inside DashboardMetrics */}
              <DashboardMetrics metrics={metrics} />
            </section>

            {/* Messages + charts split */}
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,2.6fr)]">
              <section
                aria-label="Messages snapshot"
                role="region"
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4 md:p-6"
              >
                <DashboardMessagesPreview inbox={inboxSummary} />
              </section>

              <section
                aria-label="Activity charts"
                role="region"
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4 md:p-6"
              >
                <DashboardCharts data={chartPoints} />
              </section>
            </div>

            {/* Recent listings */}
            <section
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4 md:p-6"
              aria-label="Your recent listings"
              role="region"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
                    Your Recent Listings
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
                    Quick access to what you&apos;ve posted most recently.
                  </p>
                </div>
                <Link
                  href="/sell"
                  prefetch={false}
                  className="inline-flex items-center text-xs font-semibold text-[var(--text-muted)] underline underline-offset-4 decoration-[var(--border)] transition hover:text-[var(--text)] sm:text-sm"
                >
                  Post another →
                </Link>
              </div>

              {recentListings.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-6 text-center sm:mt-6 sm:p-8">
                  <EmptyBoxIllustration className="mx-auto h-20 w-20 text-[var(--text-muted)] opacity-90 sm:h-24 sm:w-24" />
                  <p className="mt-3 text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
                    No listings yet
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
                    Post your first item to get started.
                  </p>
                  <div className="mt-4">
                    <Link href="/sell" prefetch={false} className={btnBase}>
                      Post a Listing
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:mt-5 sm:gap-4 lg:grid-cols-3">
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
        </section>
      </main>
    );
  } catch (err: unknown) {
    // Fatal SSR error → soft error UI instead of bubbling a 500
    // eslint-disable-next-line no-console
    console.error("[dashboard SSR fatal]", err);
    return (
      <main
        id="main"
        className="min-h-[calc(100vh-4rem)] bg-[var(--bg)] px-4 py-4 text-[var(--text)] sm:py-6 md:px-8 lg:px-12 xl:px-16"
        data-soft-error="dashboard"
        data-e2e="dashboard-soft-error"
      >
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl">
            We hit a dashboard error
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
            Something went wrong loading your dashboard. Please refresh. If this
            continues, contact support - the error has been logged.
          </p>
          <div className="mt-3">
            <Link
              href="/dashboard"
              prefetch={false}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-soft transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm"
            >
              Retry
            </Link>
          </div>
        </div>
      </main>
    );
  }
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

function EmptyBoxIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      className={className}
      role="img"
      aria-label="Empty"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <defs>
        <linearGradient id="qsEmptyBoxTop" x1="20" y1="28" x2="108" y2="28">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="qsEmptyBoxSide" x1="20" y1="64" x2="108" y2="64">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* subtle sparkle */}
      <path
        d="M92 18l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z"
        fill="currentColor"
        fillOpacity="0.22"
      />
      <path
        d="M32 22l1.6 4.6L38 28l-4.4 1.4L32 34l-1.6-4.6L26 28l4.4-1.4L32 22Z"
        fill="currentColor"
        fillOpacity="0.18"
      />

      {/* box */}
      <path
        d="M24 46l40-16 40 16-40 16-40-16Z"
        fill="url(#qsEmptyBoxTop)"
      />
      <path
        d="M24 46v46c0 4 2.4 7.6 6.1 9.1L64 116V62L24 46Z"
        fill="url(#qsEmptyBoxSide)"
      />
      <path
        d="M104 46v46c0 4-2.4 7.6-6.1 9.1L64 116V62l40-16Z"
        fill="url(#qsEmptyBoxSide)"
      />

      {/* outlines */}
      <path
        d="M24 46l40-16 40 16-40 16-40-16Z"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M24 46v46c0 4 2.4 7.6 6.1 9.1L64 116l33.9-14.9c3.7-1.5 6.1-5.1 6.1-9.1V46"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M64 62v54"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* lid seam */}
      <path
        d="M44 38l20 8 20-8"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
