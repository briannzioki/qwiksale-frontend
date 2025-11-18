// src/app/signin/_components/CredentialsForm.client.tsx
"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

/**
 * Credentials sign-in form (client-only) that uses next-auth's signIn()
 * for CSRF-safe credential login with a real redirect.
 *
 * IMPORTANT:
 * - We still render a real <form action=... method="post"> as a hard fallback
 *   in case JS/React dies. NextAuth's /callback/credentials will then issue
 *   its own redirect.
 * - In the normal JS-enabled path, we intercept submit and call signIn(),
 *   which performs a full document navigation (redirect: true) so Playwright
 *   sees a proper navigation event and does not hang on the current URL.
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
  const [error] = React.useState<string | null>(null);

  const emailRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const onSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (loading) return;

      const form = e.currentTarget;
      const fd = new FormData(form);
      const email = String(fd.get("email") ?? "").trim();
      const password = String(fd.get("password") ?? "");

      if (!email || !password) {
        if (form.reportValidity) form.reportValidity();
        return;
      }

      setLoading(true);
      try {
        /**
         * Auth.js v5 / next-auth v5:
         * signIn(provider, { redirect: true, callbackUrl }) still causes a
         * real document.location change. We do NOT try to handle the response;
         * we let the browser navigate, which satisfies Playwright's
         * "waitForNavigation" expectations.
         */
        await signIn("credentials", {
          redirect: true,
          callbackUrl: callbackUrl || "/dashboard",
          email,
          password,
        });
        // With redirect: true, we usually never resume execution here.
      } finally {
        // Harmless safety for edge-cases where redirect doesn't fire.
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
      {/* Keep server CSRF and callback as hard POST fallback */}
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
