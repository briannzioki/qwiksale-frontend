"use client";
// src/app/auth-test/page.tsx

import type { Session } from "next-auth";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

/**
 * Debug page to quickly verify NextAuth session and /api/me.
 * - Uses next-auth/react (client-safe)
 * - Emits tiny analytics events for local debugging
 */

type Tier = "FREE" | "GOLD" | "PLATINUM";
type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        id: string;
        email?: string | null;
        name?: string | null;
        subscription?: Tier;
      };
    };

/* --------------------------- tiny analytics utils --------------------------- */
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

export default function AuthTest() {
  const { data: session, status } = useSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const liveRef = useRef<HTMLSpanElement | null>(null);

  // Safer typed access to custom fields on session.user
  const u = (session?.user ?? null) as (Session["user"] & {
    id?: string;
    subscription?: Tier | null;
  }) | null;
  const sub = u?.subscription ?? null;
  const uid = u?.id;

  const isAuthed = status === "authenticated";

  const announce = useCallback((msg: string) => {
    const el = liveRef.current;
    if (!el) return;
    el.textContent = msg;
    const t = setTimeout(() => {
      el.textContent = "";
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  const pingMe = useCallback(async () => {
    try {
      setLoadingMe(true);
      track("auth_debug_ping_me");
      const r = await fetch("/api/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const j: MeResponse = await r.json();
      setMe(j);
      if (!r.ok) {
        toast.error("Could not fetch /api/me");
        announce("Fetch failed");
      } else {
        toast.success("Fetched /api/me");
        announce("Fetched /api/me");
      }
    } catch {
      toast.error("Network error hitting /api/me");
      announce("Network error");
    } finally {
      setLoadingMe(false);
    }
  }, [announce]);

  const copy = useCallback(
    async (text?: string) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Copied");
        announce("Copied");
      } catch {
        toast.error("Copy failed");
        announce("Copy failed");
      }
    },
    [announce],
  );

  // Pretty JSON of the session for quick visual checks
  const sessionJson = useMemo(() => {
    if (!session) return "{}";
    const safe = {
      user: {
        id: u?.id ?? null,
        email: u?.email ?? null,
        name: u?.name ?? null,
        subscription: sub ?? null,
      },
      expires: (session as any)?.expires ?? null,
    };
    return JSON.stringify(safe, null, 2);
  }, [session, u?.id, u?.email, u?.name, sub]);

  // auto-fetch /api/me when authenticated (optional)
  useEffect(() => {
    if (isAuthed && me === null && !loadingMe) {
      void pingMe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  return (
    <div className="container-page space-y-6 bg-[var(--bg)] py-6 text-[var(--text)]">
      {/* SR live region */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] px-6 py-8 text-white shadow-soft">
        <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
          Auth Debug
        </h1>
        <p className="mt-1 text-sm text-white/80">
          Check sign-in status, session fields, and the{" "}
          <code className="rounded bg-white/10 px-1">/api/me</code> API.
        </p>
      </div>

      {/* Auth state card */}
      <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <div>
              <span className="font-semibold">Status:</span>{" "}
              <span
                className={
                  isAuthed ? "text-[var(--text)]" : "text-[var(--text-muted)]"
                }
              >
                {status}
              </span>
            </div>
            {isAuthed ? (
              <>
                <div>
                  <span className="font-semibold">Email:</span> {u?.email || "-"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">User ID:</span>
                  <code className="rounded bg-[var(--bg-subtle)] px-2 py-0.5">
                    {uid || "-"}
                  </code>
                  {uid && (
                    <button
                      onClick={() => copy(uid)}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)] transition hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
                    >
                      Copy
                    </button>
                  )}
                </div>
                <div>
                  <span className="font-semibold">Subscription:</span>{" "}
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-xs text-[var(--text)]">
                    {sub || "FREE"}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-[var(--text-muted)]">
                You are not signed in.
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isAuthed ? (
              <button
                onClick={() => {
                  track("auth_debug_signin_click");
                  // next-auth/react: signIn still accepts callbackUrl
                  signIn(undefined, { callbackUrl: "/auth-test" });
                }}
                className="btn-gradient-primary focus-visible:outline-none focus-visible:ring-2 ring-focus"
              >
                Sign in
              </button>
            ) : (
              <button
                onClick={() => {
                  track("auth_debug_signout_click");
                  // next-auth/react: use callbackUrl to land back here
                  signOut({ callbackUrl: "/auth-test" });
                }}
                className="btn-outline focus-visible:outline-none focus-visible:ring-2 ring-focus"
              >
                Sign out
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={pingMe}
            disabled={loadingMe}
            className="btn-outline focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-60"
          >
            {loadingMe ? "Pinging /api/me…" : "Ping /api/me"}
          </button>
          <Link
            href="/api/auth/session"
            className="btn-outline focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            View NextAuth session JSON
          </Link>
          <Link
            href="/dashboard"
            className="btn-outline focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/settings/billing"
            className="btn-outline focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            Go to Billing
          </Link>
        </div>
      </div>

      {/* Session JSON */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Session (sanitized)</h2>
          <button
            onClick={() => copy(sessionJson)}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)] transition hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            Copy JSON
          </button>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text)]">
          {sessionJson}
        </pre>
      </div>

      {/* /api/me JSON */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">/api/me response</h2>
          <button
            onClick={pingMe}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)] transition hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            Refresh
          </button>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text)]">
          {JSON.stringify(me ?? { hint: "Click Ping /api/me" }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
