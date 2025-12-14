// src/app/signin/_components/CredentialsForm.client.tsx
"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

/**
 * Credentials sign-in form (client-only).
 *
 * Key behavior:
 * - We ALWAYS use next-auth's signIn() helper in JS-enabled browsers so the
 *   CSRF cookie+token are created in the real browser session (prevents MissingCSRF).
 * - We still render a real <form action=... method="post"> as a hard fallback.
 *   (If JS is disabled, the browser will POST normally to the action.)
 */
export function CredsFormClient({
  action,
  callbackUrl,
  csrfFromServer = "",
}: {
  action: string;
  callbackUrl: string;
  csrfFromServer?: string;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const onSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      if (loading) {
        e.preventDefault();
        return;
      }

      const form = e.currentTarget;

      // JS-enabled path: intercept and use next-auth helper (it will fetch CSRF and set cookies).
      e.preventDefault();

      const fd = new FormData(form);
      const email = String(fd.get("email") ?? "").trim();
      const password = String(fd.get("password") ?? "");

      if (!email || !password) {
        if (form.reportValidity) form.reportValidity();
        return;
      }

      const safeCb =
        typeof callbackUrl === "string" && callbackUrl.startsWith("/")
          ? callbackUrl
          : "/dashboard";

      setError(null);
      setLoading(true);
      try {
        /**
         * Auth.js v5 / next-auth v5:
         * signIn(provider, { redirect: true, callbackUrl }) triggers a real
         * document navigation. Playwright "waitForNavigation" expectations are satisfied.
         */
        const res = await signIn("credentials", {
          redirect: true,
          callbackUrl: safeCb,
          email,
          password,
        });

        // Safety: if redirect didn't happen, but next-auth returned a URL, navigate.
        const nextUrl = (res as any)?.url;
        if (typeof nextUrl === "string" && nextUrl) {
          window.location.href = nextUrl;
          return;
        }

        // If it returned an error without redirect, show a friendly message.
        const err = (res as any)?.error;
        if (typeof err === "string" && err) {
          setError(
            err === "CredentialsSignin"
              ? "Email or password is incorrect."
              : "Sign-in failed. Please try again.",
          );
        }
      } catch {
        setError("Sign-in failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [callbackUrl, loading],
  );

  return (
    <form
      onSubmit={onSubmit}
      action={action}
      method="post"
      className="rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      noValidate
    >
      {/* Hard fallback fields for native POST if JS is disabled */}
      {csrfFromServer ? (
        <input type="hidden" name="csrfToken" value={csrfFromServer} readOnly />
      ) : null}
      <input type="hidden" name="callbackUrl" value={callbackUrl} readOnly />

      <div className="space-y-3">
        <div>
          <label htmlFor="email" className="label font-semibold">
            Email
          </label>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            className="input"
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            required
            aria-required="true"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="password" className="label font-semibold">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            placeholder="••••••••"
            autoComplete="current-password"
            minLength={6}
            required
            aria-required="true"
            disabled={loading}
          />
          <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">
            Minimum 6 characters.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className="btn-gradient-primary mt-2 w-full"
          disabled={loading}
          aria-busy={loading ? "true" : "false"}
          aria-disabled={loading ? "true" : "false"}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
          <span>
            New here?{" "}
            <Link
              href="/signup"
              prefetch={false}
              className="underline underline-offset-2"
            >
              Create an account
            </Link>
          </span>
          <Link
            href="/reset-password"
            prefetch={false}
            className="underline underline-offset-2"
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </form>
  );
}
