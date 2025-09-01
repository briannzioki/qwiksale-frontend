// src/app/signin/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

function isSafePath(p?: string | null): p is string {
  // allow "/foo" but not "", not "//", not "http(s)://..."
  return !!p && /^\/(?!\/)/.test(p);
}

export default function SignInPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const returnToRaw = sp.get("callbackUrl");
  const returnTo = isSafePath(returnToRaw) ? returnToRaw : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState<"creds" | "google" | null>(null);

  async function afterLoginRedirect() {
    // If we have a safe callback target (e.g. /sell), go there directly
    if (isSafePath(returnTo)) {
      router.replace(returnTo);
      return;
    }

    // Otherwise, you can optionally nudge to profile; or just go home:
    // router.replace("/");
    try {
      const r = await fetch("/api/auth/session", { cache: "no-store" });
      const s = await r.json().catch(() => null);
      const needs = !!s?.needsProfile;
      router.replace(needs ? "/account/complete-profile" : "/");
    } catch {
      router.replace("/");
    }
  }

  async function onCreds(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error("Enter email and password.");
    try {
      setWorking("creds");
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (!res || res.error) return toast.error(res?.error || "Sign-in failed.");
      toast.success("Welcome!");
      await afterLoginRedirect();
    } finally {
      setWorking(null);
    }
  }

  async function onGoogle() {
    setWorking("google");
    try {
      await signIn("google", { callbackUrl: returnTo });
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="container-page py-8">
      <div className="mx-auto max-w-xl">
        <div className="hero-surface">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">Sign in to QwikSale</h1>
          <p className="text-sm text-white/80 dark:text-slate-300">
            Use your email & password. You can also continue with Google.
          </p>
        </div>

        <div className="mt-6 grid gap-6">
          <form onSubmit={onCreds} className="card-surface p-4 space-y-3">
            <div>
              <label className="block text-sm font-semibold mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Password</label>
              <input
                type="password"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={!!working}
              className="w-full rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {working === "creds" ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-xs text-gray-500 dark:text-slate-400">
              New here?{" "}
              <Link href="/signin#create" className="underline">
                Create your account
              </Link>
            </p>
          </form>

          <div className="card-surface p-4">
            <button
              onClick={onGoogle}
              disabled={!!working}
              className="w-full rounded-xl border px-4 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60"
              aria-label="Continue with Google"
            >
              {working === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
