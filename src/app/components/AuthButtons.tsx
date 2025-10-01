// src/app/components/AuthButtons.tsx
"use client";

import type { Session } from "next-auth";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

type Tier = "FREE" | "GOLD" | "PLATINUM";

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

/* ------------------------------- subparts ------------------------------- */
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

function TierBadge({ tier }: { tier?: Tier }) {
  if (!tier || tier === "FREE") {
    return (
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide border border-white/20">
        FREE
      </span>
    );
  }
  const cls =
    tier === "GOLD"
      ? "bg-yellow-400/20 border-yellow-300/30 text-yellow-900/80 dark:text-yellow-200"
      : "bg-indigo-300/20 border-indigo-200/30 text-indigo-900/80 dark:text-indigo-200";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide border ${cls}`}
      title={`${tier} subscriber`}
    >
      {tier}
    </span>
  );
}

/* --------------------------------- main --------------------------------- */
export default function AuthButtons() {
  const { data: session, status } = useSession();
  const [working, setWorking] = useState<"out" | null>(null);
  const [open, setOpen] = useState(false);

  // close on hash/navigation changes
  useEffect(() => {
    const onHash = () => setOpen(false);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // close on outside click
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

  // close on Escape + simple menu keyboard nav
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusablesRef = useRef<HTMLElement[]>([]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        (rootRef.current?.querySelector("summary") as HTMLElement | null)?.focus?.();
        return;
      }
      if (!menuRef.current) return;
      const els = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')
      );
      focusablesRef.current = els;
      const current = document.activeElement as HTMLElement | null;
      const idx = els.findIndex((el) => el === current);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = els[(idx + 1 + els.length) % els.length] || els[0];
        next?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = els[(idx - 1 + els.length) % els.length] || els[els.length - 1];
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

  // robust tracking that doesn't rely on native <details> toggle
  useEffect(() => {
    if (open) track("auth_dropdown_open");
  }, [open]);

  // ✅ Correct typing for session.user
  const user = (session?.user ?? null) as (Session["user"] & {
    subscription?: Tier;
    name?: string | null;
  }) | null;

  const tier = user?.subscription; // may be undefined

  const displayName = useMemo(() => {
    if (user?.name) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  }, [user?.name, user?.email]);

  if (status === "loading") {
    return (
      <button className="px-3 py-2 rounded border text-sm opacity-80 cursor-default" disabled>
        Loading…
      </button>
    );
  }

  if (!session) {
    return (
      <Link
        href="/signin"
        className="px-3 py-2 rounded bg-white/10 border border-white/30 ring-1 ring-white/20 text-sm hover:bg-white/20 transition"
        data-testid="auth-signin"
        title="Sign in"
        prefetch={false}
        onClick={() => track("auth_signin_click")}
      >
        Sign in
      </Link>
    );
  }

  return (
    <details ref={rootRef} className="relative group" open={open}>
      <summary
        className="list-none inline-flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm border border-white/30 ring-1 ring-white/20 hover:bg-white/20 transition cursor-pointer select-none"
        aria-haspopup="menu"
        aria-expanded={open}
        role="button"
        onClick={(e) => {
          // prevent page jump with <summary>
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
        <span className="hidden sm:inline max-w-[14ch] truncate">{displayName}</span>
        <TierBadge tier={tier ?? "FREE"} />
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          className={`ml-1 transition-transform ${open ? "rotate-180" : ""}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M7 10l5 5 5-5H7z" />
        </svg>
      </summary>

      <div
        ref={menuRef}
        role="menu"
        className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200/70 bg-white text-gray-800 shadow-xl overflow-hidden z-50 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700"
      >
        <div className="px-3 py-2 border-b bg-gray-50/70 dark:bg-gray-800/40 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">Signed in as</div>
          <div className="truncate text-sm font-medium">{user?.email || "…"}</div>
        </div>

        <nav className="py-1 text-sm">
          <Link
            href="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
            prefetch={false}
          >
            Dashboard
          </Link>
          <Link
            href="/account/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
            prefetch={false}
          >
            Edit profile
          </Link>
          <Link
            href="/saved"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
            prefetch={false}
          >
            Saved items
          </Link>
          <Link
            href="/settings/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
            prefetch={false}
          >
            {tier && tier !== "FREE" ? "Manage subscription" : "Upgrade subscription"}
          </Link>
        </nav>

        {/* The ONLY action that clears session */}
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
          className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 border-t border-gray-200 dark:border-gray-700"
          disabled={!!working}
        >
          {working === "out" ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}
