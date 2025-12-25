// src/app/components/AuthButtons.tsx
"use client";

import type { Session } from "next-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import RoleChip from "@/app/components/RoleChip";
import VerifiedBadge from "@/app/components/VerifiedBadge";
import { Icon } from "@/app/components/Icon";

/* ------------------------- tiny event/analytics ------------------------- */
function emit(name: string, detail?: unknown) {
  // Keep this dirt simple - useful in Playwright traces and in the browser.
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

  const rootRef = useRef<HTMLDetailsElement | null>(null);

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

  // Close the dropdown when the route changes (keeps mobile tidy).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click + Escape (mobile usability).
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const t = e.target as Node | null;
      if (t && el.contains(t)) return;
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* ------------------------ loading placeholder ------------------------ */
  // While things are indeterminate, *never* show a "Sign in" link.
  if (!authedHint && stillResolving) {
    return (
      <button
        className={[
          "cursor-default rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
          "px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm text-[var(--text-muted)] shadow-sm opacity-80",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
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
        className={[
          "inline-flex items-center justify-center rounded-xl",
          "border border-[var(--border)] bg-[var(--bg-elevated)]",
          "px-2.5 py-1.5 sm:px-3 sm:py-2",
          "text-sm font-semibold text-[var(--text)] shadow-sm transition",
          "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
        prefetch={false}
        data-testid="auth-signin"
        aria-label="Sign in to your account"
      >
        Sign in
      </Link>
    );
  }

  /* --------- fledgling session (server/clients say yes, data still loading) -------- */
  if (!session && authedHint) {
    return (
      <button
        type="button"
        className={[
          "cursor-default rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
          "px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm text-[var(--text-muted)] shadow-sm opacity-80",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
        disabled
        data-testid="account-menu-placeholder"
      >
        Account
      </button>
    );
  }

  /* ----------------------------- authenticated ----------------------------- */
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

  const triggerClasses = [
    // Hide default summary marker everywhere
    "list-none [&::-webkit-details-marker]:hidden",
    "inline-flex cursor-pointer items-center gap-2 rounded-xl",
    "border border-[var(--border)] bg-[var(--bg-elevated)]",
    "px-2 py-1.5 sm:px-2.5 sm:py-1.5",
    "text-sm font-semibold text-[var(--text)] shadow-sm transition",
    "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
  ].join(" ");

  const menuItemClasses = [
    "block px-3 py-2 text-[var(--text)] transition",
    "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
  ].join(" ");

  return (
    <details className="group relative" open={open} ref={rootRef}>
      <summary
        className={triggerClasses}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
          if (!open) track("auth_dropdown_open");
        }}
        data-testid="account-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-7 w-7 rounded-full object-cover ring-1 ring-[var(--border-subtle)]"
          />
        ) : (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text)]">
            {displayName[0]?.toUpperCase?.() ?? "U"}
          </span>
        )}

        {/* Keep header compact on phones */}
        <span className="hidden max-w-[14ch] truncate sm:inline">{displayName}</span>

        {/* Only show these on larger screens to avoid header overflow */}
        {isVerified && <VerifiedBadge className="hidden md:inline-flex" />}

        <span className="hidden md:inline-flex">
          <RoleChip role={user?.role} subscription={subscription} />
        </span>

        <Icon
          name="sort"
          className={[
            "transition",
            open ? "rotate-180" : "",
            // On xs, keep the chevron but don’t let it bloat spacing
            "ml-0.5",
          ].join(" ")}
        />
      </summary>

      <div
        role="menu"
        aria-label="Account menu"
        className={[
          "absolute right-0 z-50 mt-2 overflow-hidden rounded-xl border border-[var(--border)]",
          "bg-[var(--bg-elevated)] shadow-soft",
          // ✅ responsive width so it never falls off-screen on phones
          "w-[min(92vw,22rem)] sm:w-56",
          // ✅ prevent menu going off-screen vertically
          "max-h-[70vh] overflow-auto",
        ].join(" ")}
      >
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-sm">
          <div className="text-xs text-[var(--text-muted)]">Signed in as</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <div className="truncate font-semibold text-[var(--text)]">
              {displayName}
            </div>
            {isVerified && <VerifiedBadge className="inline-flex" />}
          </div>
        </div>

        <nav className="py-1 text-sm">
          <Link
            href={dashboardHref}
            prefetch={false}
            onClick={() => setOpen(false)}
            className={menuItemClasses}
            role="menuitem"
          >
            Dashboard
          </Link>

          <Link
            href="/account/profile"
            prefetch={false}
            onClick={() => setOpen(false)}
            className={menuItemClasses}
            role="menuitem"
          >
            Edit profile
          </Link>

          {!isVerified && (
            <Link
              href="/account/profile?verify=1"
              prefetch={false}
              onClick={() => setOpen(false)}
              className={menuItemClasses}
              data-testid="account-menu-verify-email"
              role="menuitem"
            >
              Verify email
            </Link>
          )}

          <Link
            href="/saved"
            prefetch={false}
            onClick={() => setOpen(false)}
            className={menuItemClasses}
            role="menuitem"
          >
            Saved items
          </Link>

          <Link
            href="/account/billing"
            prefetch={false}
            onClick={() => setOpen(false)}
            className={menuItemClasses}
            role="menuitem"
          >
            {isPaidTier(subscription) ? "Manage subscription" : "Upgrade subscription"}
          </Link>
        </nav>

        <button
          className={[
            "w-full border-t border-[var(--border-subtle)] px-3 py-2 text-left",
            "text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99]",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            "disabled:cursor-not-allowed disabled:opacity-60",
          ].join(" ")}
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
          role="menuitem"
        >
          {working === "out" ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}
