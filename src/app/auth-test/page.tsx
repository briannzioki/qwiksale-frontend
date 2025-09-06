// src/app/auth-test/page.tsx
"use client";

import type { Session } from "next-auth";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

/**
 * Debug page to quickly verify NextAuth session and /api/me.
 * - Uses next-auth signIn/signOut programmatic calls (no full-page jumps)
 * - Copies values to clipboard with feedback
 * - Emits tiny analytics events for local debugging
 */

type Tier = "FREE" | "GOLD" | "PLATINUM";
type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: { id: string; email?: string | null; name?: string | null; subscription?: Tier };
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
    subscription?: Tier;
  }) | null;
  const sub = u?.subscription;
  const uid = u?.id;

  const isAuthed = status === "authenticated";

  const announce = useCallback((msg: string) => {
    const el = liveRef.current;
    if (!el) return;
    el.textContent = msg;
    const t = setTimeout(() => (el.textContent = ""), 1200);
    return () => clearTimeout(t);
  }, []);

  const pingMe = useCallback(async () => {
    try {
      setLoadingMe(true);
      track("auth_debug_ping_me");
      const r = await fetch("/api/me", { cache: "no-store" });
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

  const copy = useCallback(async (text?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
      announce("Copied");
    } catch {
      toast.error("Copy failed");
      announce("Copy failed");
    }
  }, [announce]);

  // Pretty JSON of the session for quick visual checks
  const sessionJson = useMemo(() => {
    if (!session) return "{}";
    const safe = {
      user: {
        id: u?.id ?? null,
        email: u?.email ?? null,
        name: u?.name ?? null,
        subscription: u?.subscription ?? null,
      },
      expires: (session as any)?.expires ?? null,
    };
    return JSON.stringify(safe, null, 2);
  }, [session, u?.id, u?.email, u?.name, u?.subscription]);

  // auto-fetch /api/me when authenticated (optional)
  useEffect(() => {
    if (isAuthed && me === null && !loadingMe) {
      void pingMe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* SR live region */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />

      {/* Header */}
      <div
        className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]"
        style={{ backgroundImage: "linear-gradient(90deg, #161748 0%, #478559 50%, #39a0ca 100%)" }}
      >
        <h1 className="text-2xl font-extrabold">Auth Debug</h1>
        <p className="text-white/90">
          Check sign-in status, session fields, and the{" "}
          <code className="px-1 rounded bg-white/10">/api/me</code> API.
        </p>
      </div>

      {/* Auth state card */}
      <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <div>
              <span className="font-semibold">Status:</span>{" "}
              <span className={isAuthed ? "text-emerald-700" : "text-rose-700"}>
                {status}
              </span>
            </div>
            {isAuthed ? (
              <>
                <div>
                  <span className="font-semibold">Email:</span> {u?.email || "—"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">User ID:</span>
                  <code className="px-2 py-0.5 rounded bg-gray-100">{uid || "—"}</code>
                  {uid && (
                    <button
                      onClick={() => copy(uid)}
                      className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
                    >
                      Copy
                    </button>
                  )}
                </div>
                <div>
                  <span className="font-semibold">Subscription:</span>{" "}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {sub || "FREE"}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-gray-600">You are not signed in.</div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isAuthed ? (
              <button
                onClick={() => {
                  track("auth_debug_signin_click");
                  // If you have multiple providers, pass { callbackUrl } only
                  signIn(undefined, { callbackUrl: "/auth-test" });
                }}
                className="rounded-lg bg-black text-white px-4 py-2 text-sm"
              >
                Sign in
              </button>
            ) : (
              <button
                onClick={() => {
                  track("auth_debug_signout_click");
                  signOut({ callbackUrl: "/auth-test" });
                }}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
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
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            {loadingMe ? "Pinging /api/me…" : "Ping /api/me"}
          </button>
          <Link
            href="/api/auth/session"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            View NextAuth session JSON
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/settings/billing"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Go to Billing
          </Link>
        </div>
      </div>

      {/* Session JSON */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Session (sanitized)</h2>
          <button
            onClick={() => copy(sessionJson)}
            className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
          >
            Copy JSON
          </button>
        </div>
        <pre className="text-xs bg-gray-50 rounded p-3 overflow-x-auto">
{sessionJson}
        </pre>
      </div>

      {/* /api/me JSON */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">/api/me response</h2>
          <button
            onClick={pingMe}
            className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
        <pre className="text-xs bg-gray-50 rounded p-3 overflow-x-auto">
{JSON.stringify(me ?? { hint: "Click Ping /api/me" }, null, 2)}
        </pre>
      </div>
    </div>
  );
}
