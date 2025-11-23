// src/app/components/AuthButtons.tsx
"use client";

import type { Session } from "next-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import RoleChip from "@/app/components/RoleChip";

/* ------------------------- tiny event/analytics ------------------------- */
function emit(name: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
function track(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  emit("qs:track", { event, payload });
}

/* -------------------------------- helpers ------------------------------- */
const isPaidTier = (t?: string | null) => {
  const v = (t ?? "").toUpperCase();
  return v === "GOLD" || v === "PLATINUM";
};

function Initials({ name }: { name?: string | null }) {
  const text =
    (name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";
  return (
    <span
      aria-hidden
      className="inline-flex h-7 w-7 select-none items-center justify-center rounded-full bg-white/20 text-xs font-semibold"
    >
      {text}
    </span>
  );
}

function getReturnTo(): string {
  try {
    const { pathname, search, hash } = window.location;
    return `${pathname}${search || ""}${hash || ""}` || "/";
  } catch {
    return "/";
  }
}

/* --------------------------------- types -------------------------------- */
type AuthButtonsProps = {
  /**
   * Server-side auth hint from HeaderClient/layout.
   * If this is true but hooks are confused, we still treat the user as
   * effectively authenticated for header UI purposes.
   */
  initialIsAuthedHint?: boolean;
};

/* --------------------------------- main --------------------------------- */
export default function AuthButtons({
  initialIsAuthedHint = false,
}: AuthButtonsProps) {
  const { data: rawSession, status } = useSession();
  const [meStatus, setMeStatus] = useState<number | null>(null);
  const [working, setWorking] = useState<"out" | null>(null);
  const [open, setOpen] = useState(false);

  // Cross-check against /api/me so the header never shows a "Sign in" link
  // while the API still considers the user authenticated (prod no-auto-logout).
  useEffect(() => {
    let cancelled = false;

    async function checkMe() {
      try {
        const res = await fetch("/api/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!cancelled) {
          setMeStatus(res.status);
        }
      } catch {
        if (!cancelled) {
          setMeStatus(0);
        }
      }
    }

    checkMe();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasServerAuthedHint = initialIsAuthedHint === true;
  const session: Session | null = (rawSession as Session | null) ?? null;

  const authedHint =
    hasServerAuthedHint ||
    status === "authenticated" ||
    !!session ||
    meStatus === 200;

  const stillResolving = status === "loading" || meStatus === null;
  const definiteGuest =
    !authedHint &&
    status === "unauthenticated" &&
    meStatus !== 200 &&
    meStatus !== null;

  // Keep body flagged with current auth state so other components (e.g. hero)
  // can reliably know if the app is authed, independent of their own hooks.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (!body) return;

    if (authedHint) {
      body.dataset["qsSession"] = "authed";
    } else {
      delete body.dataset["qsSession"];
    }
  }, [authedHint]);

  useEffect(() => {
    const onHash = () => setOpen(false);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const rootRef = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node;
      if (!root.contains(target)) setOpen(false);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [open]);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusablesRef = useRef<HTMLElement[]>([]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        (
          rootRef.current?.querySelector(
            "summary",
          ) as HTMLElement | null
        )?.focus?.();
        return;
      }
      if (!menuRef.current) return;
      const els = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled])',
        ),
      );
      focusablesRef.current = els;
      const current = document.activeElement as HTMLElement | null;
      const idx = els.findIndex((el) => el === current);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next =
          els[(idx + 1 + els.length) % els.length] || els[0];
        next?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev =
          els[(idx - 1 + els.length) % els.length] ||
          els[els.length - 1];
        prev?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        els[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        els[els.length - 1]?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) track("auth_dropdown_open");
  }, [open]);

  // While auth state is unresolved, render a neutral placeholder — do NOT show
  // a "Sign in" link yet.
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

  // Genuine guest: hooks say unauthenticated AND /api/me is non-200.
  if (definiteGuest) {
    const signInHref = `/signin?callbackUrl=${encodeURIComponent(
      getReturnTo(),
    )}`;
    return (
      <Link
        href={signInHref}
        className="rounded-lg border border-[var(--border)] bg-subtle px-3 py-2 text-sm text-[var(--text)] transition hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
        data-testid="auth-signin"
        title="Sign in"
        prefetch={false}
        onClick={() => track("auth_signin_click")}
      >
        Sign in
      </Link>
    );
  }

  // We have an auth hint (/api/me or SSR) but no concrete session object yet:
  // render an "Account" placeholder instead of flashing a Sign in link.
  if (!session) {
    return (
      <button
        type="button"
        className="cursor-default rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)] opacity-80"
        disabled
        aria-label="Account loading"
        data-testid="account-menu-placeholder"
      >
        Account
      </button>
    );
  }

  const user = (session.user ?? null) as (Session["user"] & {
    subscription?: string | null;
    role?: string | null;
    name?: string | null;
    isAdmin?: boolean;
  }) | null;

  const subscription = user?.subscription ?? null;
  const roleU = (user?.role ?? "").toUpperCase();
  const isAdmin =
    user?.isAdmin === true ||
    roleU === "ADMIN" ||
    roleU === "SUPERADMIN";
  const dashboardHref = isAdmin ? "/admin" : "/dashboard";

  const displayName = useMemo(() => {
    if (user?.name) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  }, [user?.name, user?.email]);

  // Authenticated view: account menu with single RoleChip.
  return (
    <details ref={rootRef} className="group relative" open={open}>
      <summary
        className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-sm text-[var(--text)] transition hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 ring-focus"
        aria-haspopup="menu"
        aria-expanded={open}
        role="button"
        aria-label="Open account menu"
        data-testid="account-menu-trigger"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white/40"
            referrerPolicy="no-referrer"
          />
        ) : (
          <Initials name={user?.name ?? null} />
        )}
        <span className="hidden max-w-[14ch] truncate sm:inline">
          {displayName}
        </span>
        {/* Single session chip used by tests */}
        <RoleChip role={user?.role ?? null} subscription={subscription} />
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          className={`ml-1 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M7 10l5 5 5-5H7z" />
        </svg>
      </summary>

      <div
        ref={menuRef}
        role="menu"
        className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-soft"
      >
        <div className="border-b border-[var(--border-subtle)] bg-subtle px-3 py-2">
          <div className="text-xs text-[var(--text-muted)]">
            Signed in as
          </div>
          <div className="truncate text-sm font-medium">
            {user?.email || "…"}
          </div>
        </div>

        <nav className="py-1 text-sm">
          <Link
            href={dashboardHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-subtle"
            prefetch={false}
          >
            Dashboard
          </Link>
          <Link
            href="/account/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-subtle"
            prefetch={false}
          >
            Edit profile
          </Link>
          <Link
            href="/saved"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-subtle"
            prefetch={false}
          >
            Saved items
          </Link>
          <Link
            href="/account/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-subtle"
            prefetch={false}
          >
            {isPaidTier(subscription)
              ? "Manage subscription"
              : "Upgrade subscription"}
          </Link>
        </nav>

        <button
          data-testid="auth-signout"
          role="menuitem"
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
          className="w-full border-t border-[var(--border-subtle)] px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
          disabled={!!working}
        >
          {working === "out" ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}
