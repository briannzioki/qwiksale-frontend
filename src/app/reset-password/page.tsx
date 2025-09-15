// src/app/reset-password/page.tsx
"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function strengthLabel(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong", "Excellent"];
  return labels[Math.min(score, labels.length - 1)];
}

/* ------------------------------------------------------------------ */
/* Inner client component                                             */
/* ------------------------------------------------------------------ */

function ResetPasswordPageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  // If token exists, we’re in "set new password" mode
  const token = sp.get("token") || sp.get("t") || "";
  const hasToken = !!token;

  // Optional return path after success
  const returnTo = useMemo(() => {
    const r = sp.get("return") || sp.get("callbackUrl") || "/signin";
    return /^\/(?!\/)/.test(String(r)) ? String(r) : "/signin";
  }, [sp]);

  /* ---------- Request form state ---------- */
  const [email, setEmail] = useState("");
  const [requesting, setRequesting] = useState(false);

  /* ---------- Reset form state ---------- */
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    // Prefill email from localStorage if present (non-blocking)
    if (!hasToken) {
      try {
        const saved = localStorage.getItem("auth:lastEmail");
        if (saved) setEmail(saved);
      } catch {}
    }
  }, [hasToken]);

  useEffect(() => {
    // Keep most recent email for convenience
    try {
      if (email) localStorage.setItem("auth:lastEmail", email);
    } catch {}
  }, [email]);

  /* ---------- Actions ---------- */

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!isValidEmail(em)) {
      toast.error("Enter a valid email.");
      return;
    }

    try {
      setRequesting(true);
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || (j as any)?.error) {
        throw new Error((j as any)?.error || `Failed (${res.status})`);
      }
      toast.success("If that email exists, we’ve sent a reset link.");
    } catch (err: any) {
      toast.error(err?.message || "Could not send reset email.");
    } finally {
      setRequesting(false);
    }
  }

  function validateNewPassword(): string | null {
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    if (!hasToken) {
      toast.error("Missing or invalid reset token.");
      return;
    }
    const v = validateNewPassword();
    if (v) {
      toast.error(v);
      return;
    }

    try {
      setResetting(true);
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || (j as any)?.error) {
        throw new Error((j as any)?.error || `Failed (${res.status})`);
      }
      toast.success("Password updated. You can sign in now.");
      router.replace(returnTo);
    } catch (err: any) {
      toast.error(err?.message || "Could not reset password.");
    } finally {
      setResetting(false);
    }
  }

  /* ---------- Visual helpers ---------- */
  const pwStrength = strengthLabel(password);
  const pwBarPct =
    pwStrength === "Too short"
      ? 10
      : pwStrength === "Weak"
      ? 25
      : pwStrength === "Okay"
      ? 45
      : pwStrength === "Good"
      ? 65
      : pwStrength === "Strong"
      ? 85
      : 100;

  /* ---------- Render ---------- */
  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl p-6 text-white shadow-soft bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            {hasToken ? "Set a new password" : "Reset your password"}
          </h1>
          <p className="mt-1 text-white/85">
            {hasToken
              ? "Enter a new password for your account."
              : "We’ll email you a link to reset your password."}
          </p>
        </div>

        {!hasToken ? (
          <form
            onSubmit={onRequest}
            className="mt-6 rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4"
          >
            <div>
              <label htmlFor="email" className="label font-semibold">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                inputMode="email"
              />
            </div>

            <button
              type="submit"
              disabled={requesting}
              aria-busy={requesting}
              className="btn-gradient-primary w-full"
            >
              {requesting ? "Sending…" : "Send reset link"}
            </button>

            <div className="text-xs text-gray-600 dark:text-slate-400 text-center">
              Remembered it?{" "}
              <Link href="/signin" className="underline underline-offset-2">
                Back to sign in
              </Link>
            </div>
          </form>
        ) : (
          <form
            onSubmit={onReset}
            className="mt-6 rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4"
          >
            <div>
              <label htmlFor="password" className="label font-semibold">
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  className="input pr-24"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="btn-outline absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-pressed={showPwd}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? "Hide" : "Show"}
                </button>
              </div>

              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pwBarPct < 35
                        ? "bg-red-400"
                        : pwBarPct < 65
                        ? "bg-yellow-400"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${pwBarPct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                  Strength: {pwStrength}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="confirm" className="label font-semibold">
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                className="input"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={6}
                required
              />
            </div>

            <button
              type="submit"
              disabled={resetting}
              aria-busy={resetting}
              className="btn-gradient-primary w-full"
            >
              {resetting ? "Updating…" : "Update password"}
            </button>

            <div className="text-xs text-gray-600 dark:text-slate-400 text-center">
              Done?{" "}
              <Link href="/signin" className="underline underline-offset-2">
                Go to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page wrapper (Suspense to keep useSearchParams safe)               */
/* ------------------------------------------------------------------ */

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}
