// src/app/auth-test/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: { id: string; email?: string | null; name?: string | null; subscription?: "FREE" | "GOLD" | "PLATINUM" };
    };

export default function AuthTest() {
  const { data: session, status } = useSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);

  const sub = (session?.user as any)?.subscription as MeResponse extends { authenticated: true } ? "FREE" | "GOLD" | "PLATINUM" | undefined : undefined;
  const uid = (session?.user as any)?.id as string | undefined;

  const isAuthed = status === "authenticated";

  async function pingMe() {
    try {
      setLoadingMe(true);
      const r = await fetch("/api/me", { cache: "no-store" });
      const j: MeResponse = await r.json();
      setMe(j);
      if (!r.ok) {
        toast.error("Could not fetch /api/me");
      } else {
        toast.success("Fetched /api/me");
      }
    } catch {
      toast.error("Network error hitting /api/me");
    } finally {
      setLoadingMe(false);
    }
  }

  async function copy(text?: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  // Build a pretty JSON of the session for quick visual checks
  const sessionJson = useMemo(() => {
    if (!session) return "{}";
    const safe = {
      user: {
        id: (session.user as any)?.id,
        email: session.user.email,
        name: session.user.name,
        subscription: (session.user as any)?.subscription,
      },
      expires: (session as any)?.expires,
    };
    return JSON.stringify(safe, null, 2);
  }, [session]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div
        className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]"
        style={{ backgroundImage: "linear-gradient(90deg, #161748 0%, #478559 50%, #39a0ca 100%)" }}
      >
        <h1 className="text-2xl font-extrabold">Auth Debug</h1>
        <p className="text-white/90">
          Check sign-in status, session fields, and the <code className="px-1 rounded bg-white/10">/api/me</code> API.
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
                  <span className="font-semibold">Email:</span> {session?.user?.email || "—"}
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
                onClick={() => signIn("google")}
                className="rounded-lg bg-black text-white px-4 py-2 text-sm"
              >
                Sign in with Google
              </button>
            ) : (
              <button
                onClick={() => signOut()}
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
