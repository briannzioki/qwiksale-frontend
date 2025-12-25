// src/app/signin/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { CredsFormClient } from "@/app/signin/_components/CredentialsForm.client";
import { GoogleSignInButton } from "@/app/signin/_components/GoogleSignInButton.client";
import type { SearchParams15 } from "@/app/lib/next15";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Sign in · QwikSale",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

function hasGoogleConfigured(): boolean {
  // Keep this conservative: in production only show if env suggests Google is set.
  // (Exact names vary by setup, so we check common ones.)
  const keys = [
    "GOOGLE_CLIENT_ID",
    "AUTH_GOOGLE_ID",
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  ] as const;

  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim()) return true;
  }
  return false;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams15>;
}) {
  const sp = await searchParams;

  const rawCb =
    (Array.isArray(sp["callbackUrl"])
      ? sp["callbackUrl"][0]
      : sp["callbackUrl"]) ?? "/";
  const callbackUrl = isSafePath(rawCb) ? rawCb : "/";

  const rawErr =
    (Array.isArray(sp["error"]) ? sp["error"][0] : sp["error"]) ?? null;

  const friendly =
    rawErr === "CredentialsSignin"
      ? 'Email or password is incorrect. If you registered with Google, use “Continue with Google”.'
      : rawErr === "OAuthSignin"
        ? "We couldn't start Google sign-in. Please try again."
        : rawErr === "OAuthCallback"
          ? "Google sign-in failed. Please try again."
          : rawErr === "OAuthAccountNotLinked"
            ? "This email is already linked to another login method. Use your original sign-in method."
            : rawErr === "AccessDenied"
              ? "Access denied for this account."
              : rawErr === "Configuration"
                ? "Auth is temporarily misconfigured. Please try again shortly."
                : rawErr === "CallbackRouteError"
                  ? "Sign-in callback failed. Please retry."
                  : rawErr
                    ? "Sign-in failed. Please try again."
                    : null;

  const credsAction = `/api/auth/callback/credentials?callbackUrl=${encodeURIComponent(
    callbackUrl,
  )}`;

  // ✅ No server-side /api/auth/csrf fetch.
  // CSRF cookies/tokens must be created in the browser session; the client submit
  // flow handles that (prevents MissingCSRF redirects in Playwright).
  //
  // ✅ Don’t server-fetch /providers (it causes duplication with client auth flows).
  // In dev/test, always show Google to avoid brittle setups.
  const hasGoogle =
    process.env.NODE_ENV !== "production" || hasGoogleConfigured();

  return (
    <div className="container-page py-4 text-[var(--text)] sm:py-8">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft">
          <div className="container-page py-5 text-white sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              Sign in to QwikSale
            </h1>
            <p className="mt-1 text-[11px] leading-relaxed text-white/80 sm:text-sm">
              {hasGoogle
                ? "Use your email & password, or continue with Google."
                : "Use your email & password to sign in."}
            </p>
          </div>
        </div>

        {friendly && (
          <div
            role="alert"
            className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-sm font-medium text-[var(--text)] shadow-sm sm:mt-4 sm:px-4 sm:py-3"
          >
            {friendly}
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:mt-6 sm:gap-6">
          <CredsFormClient
            action={credsAction}
            callbackUrl={callbackUrl}
            csrfFromServer=""
          />

          {hasGoogle && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-5">
              <GoogleSignInButton callbackUrl={callbackUrl} />
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
                By continuing, you agree to QwikSale’s{" "}
                <Link
                  className="text-[var(--text)] underline underline-offset-2"
                  href="/terms"
                  prefetch={false}
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  className="text-[var(--text)] underline underline-offset-2"
                  href="/privacy"
                  prefetch={false}
                >
                  Privacy Policy
                </Link>
                .
              </p>
              <div className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)] sm:mt-3">
                Returning from a protected page? You’ll be sent back to{" "}
                <code className="font-mono text-[var(--text)]">
                  {callbackUrl}
                </code>
                .
              </div>
            </div>
          )}

          <div className="text-center text-xs leading-relaxed text-[var(--text-muted)]">
            Prefer to browse first?{" "}
            <Link
              href="/"
              prefetch={false}
              className="text-[var(--text)] underline underline-offset-2"
            >
              Continue as guest
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
