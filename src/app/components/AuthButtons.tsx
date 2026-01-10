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
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function track(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  emit("qs:track", { event, payload });
}

const isPaidTier = (t?: string | null) => {
  const v = (t ?? "").toUpperCase();
  return v === "GOLD" || v === "PLATINUM";
};

function isSafeInternalPath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

function sanitizeReturnPath(raw: string, fallback: string): string {
  const v = String(raw || "").trim();
  if (!v) return fallback;
  if (!isSafeInternalPath(v)) return fallback;

  const lower = v.toLowerCase();
  if (lower === "/signin" || lower.startsWith("/signin?")) return fallback;
  if (lower === "/signup" || lower.startsWith("/signup?")) return fallback;
  if (lower.startsWith("/api/auth")) return fallback;

  return v;
}

function stripSensitiveParams(qs: string) {
  const sp = new URLSearchParams(qs || "");
  sp.delete("email");
  sp.delete("password");
  sp.delete("callbackUrl");
  sp.delete("redirectTo");
  return sp.toString();
}

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

    // Never let auth pages build nested callback URLs.
    if (p === "/signin" || p === "/signup") {
      return `/signin?callbackUrl=${encodeURIComponent("/dashboard")}`;
    }

    if (p === "/onboarding") {
      const sp = new URLSearchParams(queryString || "");
      const rawReturn = sp.get("return") || "/dashboard";
      const safeReturn = sanitizeReturnPath(rawReturn, "/dashboard");

      const encodedOnboarding = encodeURIComponent("/onboarding"); // %2Fonboarding
      const encodedReturn = encodeURIComponent(safeReturn); // /dashboard -> %2Fdashboard

      return `/signin?callbackUrl=${encodedOnboarding}?return=${encodedReturn}`;
    }

    const cleaned = stripSensitiveParams(queryString || "");
    const qs = cleaned ? `?${cleaned}` : "";
    const returnTo = `${p}${qs}` || "/";
    const safeReturnTo = sanitizeReturnPath(returnTo, "/");
    return `/signin?callbackUrl=${encodeURIComponent(safeReturnTo)}`;
  } catch {
    return "/signin";
  }
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeUsername(v: unknown): string {
  const s = safeTrim(v).replace(/^@+/, "");
  if (!s) return "";
  return /^[a-z0-9._-]{2,64}$/i.test(s) ? s : "";
}

function isEmailVerifiedValue(v: unknown): boolean {
  if (v == null) return false;
  if (v === true) return true;
  if (v instanceof Date) return Number.isFinite(v.getTime());
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v) && v > 0;
  return false;
}

type AuthButtonsProps = {
  initialIsAuthedHint?: boolean;
  /**
   * Optional hint from server auth payload.
   * In this app, this typically tracks the "verified" status you display in UI.
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

  const [sawAuthenticated, setSawAuthenticated] = useState(false);
  const [hasAuthCookie, setHasAuthCookie] = useState(false);

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
        (lower.includes("auth") && lower.includes("session"));

      if (hasAuthStyleCookie) setHasAuthCookie(true);
    } catch {
      // ignore
    }
  }, []);

  const session: Session | null = (rawSession as Session | null) ?? null;

  const hasClientAuthEvidence =
    status === "authenticated" || !!session || sawAuthenticated || hasAuthCookie;

  useEffect(() => {
    if (status === "authenticated" || !!session || hasAuthCookie) {
      setSawAuthenticated(true);
    }
  }, [status, session, hasAuthCookie]);

  const stillResolving = status === "loading";
  const authedHint = hasClientAuthEvidence || initialIsAuthedHint;
  const definiteGuest = status === "unauthenticated" && !authedHint && !stillResolving;

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (authedHint) document.body.dataset["qsSession"] = "authed";
    else delete document.body.dataset["qsSession"];
  }, [authedHint]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

  if (!session && authedHint) {
    const fallbackDashboardHref = pathname.startsWith("/admin") ? "/admin" : "/dashboard";
    return (
      <Link
        href={fallbackDashboardHref}
        className={[
          "inline-flex items-center justify-center rounded-xl",
          "border border-[var(--border)] bg-[var(--bg-elevated)]",
          "px-2.5 py-1.5 sm:px-3 sm:py-2",
          "text-sm font-semibold text-[var(--text)] shadow-sm transition",
          "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
        prefetch={false}
        aria-label="Dashboard"
        data-testid="auth-dashboard-fallback"
      >
        Dashboard
      </Link>
    );
  }

  const user = session!.user as any;

  const roleU = String(user?.role ?? "").toUpperCase();
  const subscription = user?.subscription ?? null;
  const isAdmin = user?.isAdmin === true || roleU === "ADMIN" || roleU === "SUPERADMIN";
  const dashboardHref = isAdmin ? "/admin" : "/dashboard";

  const rawUsername = normalizeUsername(user?.username);
  const rawName = safeTrim(user?.name);
  const rawEmail = safeTrim(user?.email);

  const displayName: string =
    (rawUsername ? `@${rawUsername}` : "") ||
    rawName ||
    (rawEmail ? rawEmail.split("@")[0] : "") ||
    "User";

  const displayInitial = (displayName.charAt(0) || "U").toUpperCase();

  const emailVerified =
    isEmailVerifiedValue(user?.emailVerified) ||
    isEmailVerifiedValue(user?.email_verified) ||
    isEmailVerifiedValue(user?.emailVerifiedAt) ||
    isEmailVerifiedValue(user?.email_verified_at) ||
    user?.verified === true ||
    isVerifiedHint === true;

  const isVerifiedForChip = user?.verified === true || isVerifiedHint === true;

  const triggerClasses = [
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
            {displayInitial}
          </span>
        )}

        <span className="hidden max-w-[14ch] truncate sm:inline">{displayName}</span>

        {isVerifiedForChip && <VerifiedBadge className="hidden md:inline-flex" />}

        <span className="hidden md:inline-flex">
          <RoleChip role={user?.role} subscription={subscription} />
        </span>

        <Icon name="sort" className={["transition", open ? "rotate-180" : "", "ml-0.5"].join(" ")} />
      </summary>

      <div
        role="menu"
        aria-label="Account menu"
        className={[
          "absolute right-0 z-50 mt-2 overflow-hidden rounded-xl border border-[var(--border)]",
          "bg-[var(--bg-elevated)] shadow-soft",
          "w-[min(92vw,22rem)] sm:w-56",
          "max-h-[70vh] overflow-auto",
        ].join(" ")}
      >
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-sm">
          <div className="text-xs text-[var(--text-muted)]">Signed in as</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <div className="truncate font-semibold text-[var(--text)]">{displayName}</div>
            {isVerifiedForChip && <VerifiedBadge className="inline-flex" />}
          </div>
        </div>

        <nav className="py-1 text-sm">
          <Link href={dashboardHref} prefetch={false} onClick={() => setOpen(false)} className={menuItemClasses} role="menuitem">
            Dashboard
          </Link>

          <Link href="/account/profile" prefetch={false} onClick={() => setOpen(false)} className={menuItemClasses} role="menuitem">
            Edit profile
          </Link>

          {!emailVerified && (
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

          <Link href="/saved" prefetch={false} onClick={() => setOpen(false)} className={menuItemClasses} role="menuitem">
            Saved items
          </Link>

          <Link href="/account/billing" prefetch={false} onClick={() => setOpen(false)} className={menuItemClasses} role="menuitem">
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
