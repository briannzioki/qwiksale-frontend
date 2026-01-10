"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

type Props = {
  callbackUrl: string;
  defaultEmail?: string;
  defaultPassword?: string;
};

const DEFAULT_AFTER_SIGNIN = "/dashboard";

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function decodeUpToTwo(v: string): string {
  const once = decodeMaybe(v);
  const twice = decodeMaybe(once);
  return twice;
}

function toInternalHref(urlLike: string, fallback: string): string {
  const raw = String(urlLike || "").trim();
  if (!raw) return fallback;

  if (raw.startsWith("/")) return raw;

  try {
    const u = new URL(raw);
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      const out = `${u.pathname}${u.search}${u.hash}`;
      return out.startsWith("/") ? out : fallback;
    }
  } catch {
    // ignore
  }

  return fallback;
}

function sanitizeCallback(raw: string, fallback: string): string {
  const internal = toInternalHref(raw, fallback);
  const path = isSafePath(internal) ? internal : fallback;

  const lower = path.toLowerCase();
  if (lower === "/signin" || lower.startsWith("/signin?")) return fallback;
  if (lower.startsWith("/api/auth")) return fallback;

  return path;
}

function mapAuthErrorToMessage(err: string | null): string | null {
  if (!err) return null;
  const e = String(err).trim();
  if (!e) return null;

  if (/credentialssignin/i.test(e)) return "Sign-in failed. Please try again.";
  if (/oauthsignin|oauthcallback|oauthaccountnotlinked/i.test(e)) return "Sign-in failed. Please try again.";
  if (/accessdenied/i.test(e)) return "Access denied.";
  if (/configuration/i.test(e)) return "Auth is misconfigured on the server.";

  return "Sign-in failed. Please try again.";
}

/**
 * IMPORTANT (E2E stability):
 * These inputs are intentionally UNCONTROLLED (defaultValue, no React value binding).
 * This prevents React hydration from overwriting Playwright's early `.fill()` calls,
 * which is the root cause of the flaky auth-ui test.
 */
export function CredsFormClient({ callbackUrl, defaultEmail, defaultPassword }: Props) {
  const sp = useSearchParams();

  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialEmail = useMemo(() => safeTrim(defaultEmail), [defaultEmail]);
  const initialPassword = useMemo(() => safeTrim(defaultPassword), [defaultPassword]);

  useEffect(() => {
    // Security + test hygiene: never keep credentials in the URL (even if someone pasted them).
    try {
      const u = new URL(window.location.href);
      const hadEmail = u.searchParams.has("email");
      const hadPw = u.searchParams.has("password");
      if (!hadEmail && !hadPw) return;

      u.searchParams.delete("email");
      u.searchParams.delete("password");

      const next = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState({}, "", next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const msg = mapAuthErrorToMessage(sp?.get("error") ?? null);
    if (msg) setErr(msg);
  }, [sp]);

  const safeCallback = useMemo(() => {
    const raw = decodeUpToTwo(String(callbackUrl || DEFAULT_AFTER_SIGNIN).trim());
    return sanitizeCallback(raw, DEFAULT_AFTER_SIGNIN);
  }, [callbackUrl]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const fd = new FormData(e.currentTarget);

    const em = safeTrim(fd.get("email"));
    const pwRaw = fd.get("password");
    const pw = typeof pwRaw === "string" ? pwRaw : "";
    const pwCheck = pw.trim();

    if (!em || !pwCheck) {
      setErr("Please enter your email and password.");
      return;
    }

    setErr(null);
    setSubmitting(true);

    try {
      await signIn("credentials", {
        email: em,
        password: pw,
        callbackUrl: safeCallback || DEFAULT_AFTER_SIGNIN,
        redirect: true,
      });
      // With redirect:true, the browser will leave /signin on success.
    } catch {
      setErr("Sign-in failed. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5">
      <h2 className="text-sm font-semibold text-[var(--text)] sm:text-base">Email and password</h2>

      {err && (
        <div
          role="alert"
          className="mt-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2 text-xs font-medium text-[var(--text)]"
        >
          {err}
        </div>
      )}

      <form
        data-testid="signin-form"
        onSubmit={onSubmit}
        className="mt-3 grid gap-3"
        aria-label="Sign in form"
        noValidate
        method="post"
      >
        <div className="grid gap-1">
          <label htmlFor="signin-email" className="text-xs font-semibold text-[var(--text)]">
            Email
          </label>
          <input
            data-testid="signin-email"
            id="signin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={initialEmail}
            onInput={() => {
              if (err) setErr(null);
            }}
            placeholder="Email"
            className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
            aria-label="Email"
            disabled={submitting}
          />
        </div>

        <div className="grid gap-1">
          <label htmlFor="signin-password" className="text-xs font-semibold text-[var(--text)]">
            Password
          </label>
          <input
            data-testid="signin-password"
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue={initialPassword}
            onInput={() => {
              if (err) setErr(null);
            }}
            placeholder="Password"
            className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
            aria-label="Password"
            disabled={submitting}
          />
        </div>

        <button
          data-testid="signin-submit"
          type="submit"
          className="btn-gradient-primary h-10 w-full disabled:opacity-60"
          disabled={submitting}
          aria-label="Sign in"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <div className="text-center text-[12px] leading-relaxed text-[var(--text-muted)]">
          Forgot your password?{" "}
          <a className="text-[var(--text)] underline underline-offset-2" href="/reset-password">
            Reset it
          </a>
        </div>
      </form>
    </div>
  );
}
