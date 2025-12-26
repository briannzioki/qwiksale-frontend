// src/app/reset-password/page.tsx
"use client";

import { Suspense, useMemo, useState, useEffect, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
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

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10.6 10.6a2.5 2.5 0 0 0 2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 5.4A9.6 9.6 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 6.6C3.9 8.6 2.5 12 2.5 12s3.5 7 9.5 7a9.7 9.7 0 0 0 4.3-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Inner client component                                             */
/* ------------------------------------------------------------------ */

function ResetPasswordPageInner() {
  const sp = useSearchParams();

  // If token exists, we’re in "set new password" mode
  const token = sp.get("token") || sp.get("t") || "";
  const hasToken = !!token;

  // Optional return path after success (defaults to dashboard to avoid /signin loops)
  const returnTo = useMemo(() => {
    const r = sp.get("return") || sp.get("callbackUrl") || "/dashboard";
    return /^\/(?!\/)/.test(String(r)) ? String(r) : "/dashboard";
  }, [sp]);

  /* ---------- Request form state ---------- */
  const [email, setEmail] = useState("");
  const [requesting, setRequesting] = useState(false);

  /* ---------- Reset form state ---------- */
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [done, setDone] = useState(false);

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

  async function onRequest(e: FormEvent) {
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

  async function onReset(e: FormEvent) {
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
      setDone(true); // show success UI; no programmatic redirect
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

  const pwBarOpacity =
    pwBarPct < 35 ? "opacity-40" : pwBarPct < 65 ? "opacity-60" : "opacity-85";

  /* ---------- Render ---------- */
  return (
    <div className="container-page bg-[var(--bg)] py-10">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft">
          <div className="container-page py-8 text-white">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl text-white">
              {hasToken ? "Set a new password" : "Reset your password"}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              {hasToken
                ? "Enter a new password for your account."
                : "We’ll email you a link to reset your password."}
            </p>
          </div>
        </div>

        {!hasToken ? (
          <form
            onSubmit={onRequest}
            className="mt-6 space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-soft"
          >
            <div>
              <label
                htmlFor="email"
                className="label font-semibold text-[var(--text)]"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
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
              className="btn-gradient-primary w-full focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              {requesting ? "Sending…" : "Send reset link"}
            </button>

            <div className="text-center text-xs leading-relaxed text-[var(--text-muted)]">
              Remembered it?{" "}
              <Link
                href={`/signin?callbackUrl=${encodeURIComponent(returnTo)}`}
                className="underline underline-offset-2"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        ) : (
          <form
            onSubmit={onReset}
            className="mt-6 space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-soft"
          >
            <div>
              <label
                htmlFor="password"
                className="label font-semibold text-[var(--text)]"
              >
                New password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  className="input pr-12 border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className={[
                    "absolute right-1.5 top-1/2 -translate-y-1/2",
                    "inline-flex h-9 w-9 items-center justify-center rounded-lg",
                    "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    "active:scale-[.99]",
                  ].join(" ")}
                  onClick={() => setShowPwd((s) => !s)}
                  aria-pressed={showPwd}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? (
                    <EyeOffIcon className="h-5 w-5" aria-hidden />
                  ) : (
                    <EyeIcon className="h-5 w-5" aria-hidden />
                  )}
                </button>
              </div>

              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                  <div
                    className={`h-full rounded-full bg-[var(--text)] transition-all ${pwBarOpacity}`}
                    style={{ width: `${pwBarPct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-[var(--text-muted)] opacity-80">
                  Strength: {pwStrength}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="label font-semibold text-[var(--text)]"
              >
                Confirm new password
              </label>
              <input
                id="confirm"
                type={showPwd ? "text" : "password"}
                className="input border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
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
              className="btn-gradient-primary w-full focus-visible:outline-none focus-visible:ring-2 ring-focus"
            >
              {resetting ? "Updating…" : "Update password"}
            </button>

            {done && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text)] shadow-sm"
              >
                Password updated.{" "}
                <Link
                  href={`/signin?callbackUrl=${encodeURIComponent(returnTo)}`}
                  className="underline underline-offset-2"
                >
                  Continue to sign in
                </Link>
                .
              </div>
            )}

            <div className="text-center text-xs leading-relaxed text-[var(--text-muted)]">
              Done?{" "}
              <Link
                href={`/signin?callbackUrl=${encodeURIComponent(returnTo)}`}
                className="underline underline-offset-2"
              >
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
