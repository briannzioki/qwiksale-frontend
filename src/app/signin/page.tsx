// src/app/signin/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

type Mode = "signin" | "create";

export default function SignInPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = sp.get("callbackUrl") || "/";

  // allow ?mode=create to pre-open the create tab
  const initialMode = (sp.get("mode") as Mode) === "create" ? "create" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState<"creds" | "google" | null>(null);

  // also respect #create in the hash (if someone links to /signin#create)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#create") {
      setMode("create");
    }
  }, []);

  async function afterLoginRedirect() {
    const r = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await r.json().catch(() => null);
    const needsProfile = !!session?.needsProfile;
    if (needsProfile) {
      router.replace(`/onboarding?return=${encodeURIComponent(callbackUrl)}`);
    } else {
      router.replace(callbackUrl);
    }
  }

  function validateFields() {
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email.");
      return false;
    }
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return false;
    }
    return true;
  }

  async function onCreds(e: React.FormEvent) {
    e.preventDefault();
    if (!validateFields()) return;

    try {
      setWorking("creds");

      // For create, pass register: "1" (handled in Credentials provider)
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        ...(mode === "create" ? { register: "1" } : {}),
        redirect: false,
      });

      if (!res || res.error) {
        // Normalize common NextAuth error
        const msg =
          res?.error === "CredentialsSignin"
            ? mode === "create"
              ? "Could not create account."
              : "Invalid email or password."
            : res?.error || "Sign-in failed.";
        toast.error(msg);
        return;
        }
      toast.success(mode === "create" ? "Account created!" : "Welcome back!");
      await afterLoginRedirect();
    } finally {
      setWorking(null);
    }
  }

  async function onGoogle() {
    setWorking("google");
    try {
      await signIn("google", { callbackUrl });
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
            {mode === "create"
              ? "Create your account with email & password. You can also use Google."
              : "Use your email & password. You can also continue with Google."}
          </p>
        </div>

        {/* mode switch */}
        <div className="mt-4 flex gap-2 text-sm">
          <button
            className={`rounded-lg px-3 py-1 border ${
              mode === "signin" ? "bg-white/10" : "bg-transparent"
            }`}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            className={`rounded-lg px-3 py-1 border ${
              mode === "create" ? "bg-white/10" : "bg-transparent"
            }`}
            onClick={() => setMode("create")}
          >
            Create account
          </button>
        </div>

        <div className="mt-6 grid gap-6">
          {/* Email + Password (signin or create) */}
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
                required
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
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                required
              />
            </div>
            <button
              type="submit"
              disabled={!!working}
              className="w-full rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {working === "creds"
                ? mode === "create"
                  ? "Creating…"
                  : "Signing in…"
                : mode === "create"
                ? "Create account"
                : "Sign in"}
            </button>

            {mode === "signin" ? (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                New here?{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setMode("create")}
                >
                  Create your account
                </button>
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Already have an account?{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setMode("signin")}
                >
                  Sign in instead
                </button>
              </p>
            )}
          </form>

          {/* Google */}
          <div className="card-surface p-4">
            <button
              onClick={onGoogle}
              disabled={!!working}
              className="w-full rounded-xl border px-4 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60"
              aria-label="Continue with Google"
            >
              {working === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              By continuing you agree to our{" "}
              <Link href="/terms" className="underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
