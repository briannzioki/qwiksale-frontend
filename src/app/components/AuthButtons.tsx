"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";

type Tier = "FREE" | "GOLD" | "PLATINUM";

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
      ? "bg-yellow-400/20 border-yellow-300/30"
      : "bg-indigo-300/20 border-indigo-200/30";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide border ${cls}`}
      title={`${tier} subscriber`}
    >
      {tier}
    </span>
  );
}

export default function AuthButtons() {
  const { data: session, status } = useSession();
  const [working, setWorking] = useState<"in" | "out" | null>(null);
  const [open, setOpen] = useState(false); // menu open for <details> polyfill

  // Close menu on route change (best-effort)
  useEffect(() => {
    const onHash = () => setOpen(false);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const user = session?.user;
  const tier = (user as any)?.subscription as Tier | undefined;

  const displayName = useMemo(() => {
    if (user?.name) return user.name;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  }, [user?.name, user?.email]);

  if (status === "loading") {
    return (
      <button
        className="px-3 py-2 rounded border text-sm opacity-80 cursor-default"
        aria-busy="true"
        disabled
      >
        Loading…
      </button>
    );
  }

  if (!session) {
    return (
      <button
        data-testid="auth-signin"
        onClick={async () => {
          if (working) return;
          setWorking("in");
          try {
            await signIn("google", { callbackUrl: "/" });
          } finally {
            setWorking(null);
          }
        }}
        className="px-3 py-2 rounded bg-white/10 border border-white/30 ring-1 ring-white/20 text-sm hover:bg-white/20 transition disabled:opacity-60"
        title="Sign in with Google"
        disabled={!!working}
      >
        {working === "in" ? "Opening…" : "Sign in"}
      </button>
    );
  }

  // Logged in view
  return (
    <details
      className="relative group"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className="list-none inline-flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm border border-white/30 ring-1 ring-white/20 hover:bg-white/20 transition cursor-pointer select-none"
        aria-haspopup="menu"
        aria-expanded={open}
        role="button"
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-7 w-7 rounded-full object-cover ring-2 ring-white/40"
          />
        ) : (
          <Initials name={user?.name} />
        )}
        <span className="hidden sm:inline">{displayName}</span>
        <TierBadge tier={tier} />
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          className={`ml-1 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
          fill="currentColor"
        >
          <path d="M7 10l5 5 5-5H7z" />
        </svg>
      </summary>

      {/* Menu */}
      <div
        role="menu"
        className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200/70 bg-white text-gray-800 shadow-xl overflow-hidden z-50"
      >
        <div className="px-3 py-2 border-b bg-gray-50/70">
          <div className="text-xs text-gray-500">Signed in as</div>
          <div className="truncate text-sm font-medium">{user?.email || "…"}</div>
        </div>

        <nav className="py-1 text-sm">
          <Link
            href="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-gray-50"
          >
            Dashboard
          </Link>
          <Link
            href="/saved"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-gray-50"
          >
            Saved items
          </Link>
          <Link
            href="/settings/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 hover:bg-gray-50"
          >
            {tier && tier !== "FREE" ? "Manage subscription" : "Upgrade subscription"}
          </Link>
        </nav>

        <button
          data-testid="auth-signout"
          role="menuitem"
          onClick={async () => {
            if (working) return;
            setWorking("out");
            try {
              await signOut({ callbackUrl: "/" });
            } finally {
              setWorking(null);
            }
          }}
          className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 border-t"
          disabled={!!working}
        >
          {working === "out" ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </details>
  );
}
