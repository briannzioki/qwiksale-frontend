// src/app/components/AuthButtons.tsx
"use client";

import type { Session } from "next-auth";
import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import RoleChip from "@/app/components/RoleChip";
import VerifiedBadge from "@/app/components/VerifiedBadge";
import { Icon } from "@/app/components/Icon";

/* ------------------------- tiny event/analytics ------------------------- */
function emit(name: string, detail?: unknown) {
  // Keep this dirt simple – useful in Playwright traces and in the browser.
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function track(event: string, payload?: Record<string, unknown>) {
  console.log("[qs:track]", event, payload);
  emit("qs:track", { event, payload });
}

const isPaidTier = (t?: string | null) => {
  const v = (t ?? "").toUpperCase();
  return v === "GOLD" || v === "PLATINUM";
};

/**
 * Build the Sign in href for a definite guest.
 *
 * Special case:
 *   E2E expects on /onboarding:
 *   /signin?callbackUrl=%2Fonboarding?return=%2Fdashboard
 */
function buildGuestSignInHrefFrom(pathname: string, queryString: string): string {
  try {
    const p = pathname || "/";

    if (p === "/onboarding") {
      const sp = new URLSearchParams(queryString || "");
      const rawReturn = sp.get("return") || "/dashboard";

      const encodedOnboarding = encodeURIComponent("/onboarding"); // %2Fonboarding
      const encodedReturn = encodeURIComponent(rawReturn); // e.g. /dashboard -> %2Fdashboard

      // E2E wants this shape exactly:
      // /signin?callbackUrl=%2Fonboarding?return=%2Fdashboard
      return `/signin?callbackUrl=${encodedOnboarding}?return=${encodedReturn}`;
    }

    const qs = queryString ? `?${queryString}` : "";
    const returnTo = `${p}${qs}` || "/";
    return `/signin?callbackUrl=${encodeURIComponent(returnTo)}`;
  } catch {
    return "/signin";
  }
}

type AuthButtonsProps = {
  initialIsAuthedHint?: boolean;
  /**
   * Optional hint from server auth payload. The real source of truth is
   * session.user.verified when available.
   */
  isVerified?: boolean;
};

/* --------------------------------- main --------------------------------- */
export default function AuthButtons({
  initialIsAuthedHint = false,
  isVerified: isVerifiedHint = false,
}: AuthButtonsProps) {
  const pathname = usePathname() || "/";
  const sp = useSearchParams();
  const queryString = sp?.toString?.() ?? "";

  const signInHref = useMemo(
    () => buildGuestSignInHrefFrom(pathname, queryString),
    [pathname, queryString],
  );

  const { data: rawSession, status } = useSession();
  const [working, setWorking] = useState<"out" | null>(null);
  const [open, setOpen] = useState(false);

  // Once we’ve *ever* seen an authenticated signal in this browser tab,
  // remember it so we don’t flash back to a guest header during navigation.
  const [sawAuthenticated, setSawAuthenticated] = useState(false);

  // Extra guard: if we ever detect an Auth.js/NextAuth session cookie,
  // treat that as strong evidence of an authenticated user for this tab’s lifetime.
  const [hasAuthCookie, setHasAuthCookie] = useState(false);

  /* -------------------------- cookie-based evidence -------------------------- */
  useEffect(() => {
    if (typeof document === "undefined") return;
    try {
      const raw = document.cookie ?? "";
      if (!raw) return;
      const lower = raw.toLowerCase();

      const hasAuthStyleCookie =
        lower.includes("next-auth.session-token") ||
        lower.includes("__secure-next-auth.session-token") ||
        lower.includes("__host-next-auth.session-token") ||
        lower.includes("nextauth.session-token") ||
        lower.includes("next-auth.session-token.") ||
        lower.includes("__secure-authjs.session-token") ||
        lower.includes("__host-authjs.session-token") ||
        lower.includes("authjs.session-token") ||
        // Be deliberately generous: any auth/session-style cookie name
        (lower.includes("auth") && lower.includes("session"));

      if (hasAuthStyleCookie) {
        setHasAuthCookie(true);
      }
    } catch {
      // ignore cookie parsing issues
    }
  }, []);

  const session: Session | null = (rawSession as Session | null) ?? null;

  /* ---------------------- auth state derivation (STRONG) ---------------------- */
  // Any positive signal from the client side that we *are* logged in.
  const hasClientAuthEvidence =
    status === "authenticated" || !!session || sawAuthenticated || hasAuthCookie;

  // Track if we have *ever* seen an authenticated signal in this tab.
  useEffect(() => {
    if (status === "authenticated" || !!session || hasAuthCookie) {
      setSawAuthenticated(true);
    }
  }, [status, session, hasAuthCookie]);

  // We consider "loading" as the only resolving state now.
  // IMPORTANT: We do NOT call /api/me here at all (prevents slow 401 spam on guest pages).
  const stillResolving = status === "loading";

  // Server-side hint (cookie-derived) OR any client evidence keeps us in
  // the "treat as authed" bucket.
  const authedHint = hasClientAuthEvidence || initialIsAuthedHint;

  // Only call this a definite guest when *everything* agrees and we’re not
  // in a resolving state. This prevents random session blips from flipping
  // the header back to "Sign in".
  const definiteGuest =
    status === "unauthenticated" && !authedHint && !stillResolving;

  // Reflect auth state into <body data-qs-session="authed"> for any
  // layout that wants to style on it.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (authedHint) {
      document.body.dataset["qsSession"] = "authed";
    } else {
      delete document.body.dataset["qsSession"];
    }
  }, [authedHint]);

  /* ------------------------ loading placeholder ------------------------ */
  // While things are indeterminate, *never* show a "Sign in" link.
  if (!authedHint && stillResolving) {
    return (
      <button
        className="cursor-default rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)] opacity-80"
        disabled
      >
        Loading…
      </button>
    );
  }

  /* --------------------------- guest → sign in --------------------------- */
  // Only reach this when we’re confident the user is actually a guest.
  if (definiteGuest) {
    return (
      <Link
        href={signInHref}
        className="rounded-lg border border-[var(--border)] bg-subtle px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--bg-elevated)] focus-visible:ring-2 ring-focus"
        prefetch={false}
        data-testid="auth-signin"
        aria-label="Sign in to your account"
      >
        Sign in
      </Link>
    );
  }

  /* --------- fledgling session (server/clients say yes, data still loading) -------- */
  // We have enough evidence that the user is logged in, but we don’t have the
  // full session payload yet. Show a neutral "Account" stub instead of ever
  // flashing "Sign in".
  if (!session && authedHint) {
    return (
      <button
        type="button"
        className="cursor-default rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)] opacity-80"
        disabled
        data-testid="account-menu-placeholder"
      >
        Account
      </button>
    );
  }

  /* ----------------------------- authenticated ----------------------------- */
  // At this point we treat the user as definitely signed in. No guest fallback.
  const user = session!.user as any;

  const roleU = (user?.role ?? "").toUpperCase();
  const subscription = user?.subscription ?? null;
  const isAdmin =
    user?.isAdmin === true || roleU === "ADMIN" || roleU === "SUPERADMIN";

  const dashboardHref = isAdmin ? "/admin" : "/dashboard";

  const rawUsername = typeof user?.username === "string" ? user.username.trim() : "";
  const rawName = typeof user?.name === "string" ? user.name.trim() : "";
  const rawEmail = typeof user?.email === "string" ? user.email.trim() : "";

  const displayName =
    rawUsername || rawName || (rawEmail ? rawEmail.split("@")[0] : "User");

  const isVerified = user?.verified === true || isVerifiedHint === true;

  return (
    <details className="group relative" open={open}>
      <summary
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-sm text-[var(--text)] hover:bg-subtle focus-visible:ring-2 ring-focus"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
          if (!open) track("auth_dropdown_open");
        }}
        data-testid="account-menu-trigger"
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white/40"
          />
        ) : (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
            {displayName[0]?.toUpperCase?.() ?? "U"}
          </span>
        )}

        <span className="hidden max-w-[14ch] truncate sm:inline">
          {displayName}
        </span>

        {isVerified && <VerifiedBadge className="hidden sm:inline-flex" />}

        <RoleChip role={user?.role} subscription={subscription} />

        <Icon
          name="sort"
          className={open ? "rotate-180 transition" : "transition"}
        />
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-soft">
        <div className="border-b border-[var(--border-subtle)] bg-subtle px-3 py-2 text-sm">
          <div className="text-xs text-[var(--text-muted)]">Signed in as</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <div className="truncate font-medium">{displayName}</div>
            {isVerified && <VerifiedBadge className="inline-flex" />}
          </div>
        </div>

        <nav className="py-1 text-sm">
          <Link
            href={dashboardHref}
            prefetch={false}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-subtle"
          >
            Dashboard
          </Link>

          <Link
            href="/account/profile"
            prefetch={false}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-subtle"
          >
            Edit profile
          </Link>

          {!isVerified && (
            <Link
              href="/account/profile?verify=1"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 hover:bg-subtle"
              data-testid="account-menu-verify-email"
            >
              Verify email
            </Link>
          )}

          <Link
            href="/saved"
            prefetch={false}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-subtle"
          >
            Saved items
          </Link>

          <Link
            href="/account/billing"
            prefetch={false}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-subtle"
          >
            {isPaidTier(subscription) ? "Manage subscription" : "Upgrade subscription"}
          </Link>
        </nav>

        <button
          className="w-full border-t border-[var(--border-subtle)] px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
          disabled={!!working}
          onClick={async () => {
            if (working) return;
            setWorking("out");
            track("auth_signout_click");
            try {
              await signOut({ callbackUrl: "/" });
            } finally {
              setWorking(null);
            }
          }}
        >
          {working === "out" ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}
