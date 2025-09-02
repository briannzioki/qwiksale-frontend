// src/app/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import toast from "react-hot-toast";

function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

export default function SignUpPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const returnToRaw = sp.get("callbackUrl");
  const returnTo = isSafePath(returnToRaw) ? returnToRaw : "/account/profile";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState<"creds" | "google" | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function validate(): string | null {
    if (!email) return "Enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) return toast.error(v);

    try {
      setWorking("creds");
      // Using the same Credentials provider — your authorize() creates user if not existing
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (!res || res.error) {
        // Most likely: account exists with different password, or other error
        return toast.error(res?.error || "Sign-up failed. Try a different email or sign in.");
      }
      toast.success("Account created!");
      router.replace(returnTo);
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
          <h1 className="text-2xl md:text-3xl font-extrabold mb-1">Create your QwikSale account</h1>
          <p className="text-sm text-white/80 dark:text-slate-300">
            It’s quick—use email & password or continue with Google.
          </p>
        </div>

        <div className="mt-6 grid gap-6">
          <form onSubmit={onCreate} className="card-surface p-4 space-y-3">
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-lg border px-3 py-2 pr-10"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Confirm password</label>
              <input
                type="password"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={!!working}
              className="w-full rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {working === "creds" ? "Creating account…" : "Create account"}
            </button>

            <p className="text-xs text-gray-500 dark:text-slate-400">
              Already have an account?{" "}
              <Link href="/signin" className="underline">Sign in</Link>
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
