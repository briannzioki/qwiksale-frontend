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
    <div className="container-page py-10">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] p-6 text-white shadow-soft">
          <h1 className="text-2xl font-extrabold md:text-3xl">
            Sign in to QwikSale
          </h1>
          <p className="mt-1 text-white/85">
            {hasGoogle
              ? "Use your email & password, or continue with Google."
              : "Use your email & password to sign in."}
          </p>
        </div>

        {friendly && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
          >
            {friendly}
          </div>
        )}

        <div className="mt-6 grid gap-6">
          <CredsFormClient
            action={credsAction}
            callbackUrl={callbackUrl}
            csrfFromServer=""
          />

          {hasGoogle && (
            <div className="rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <GoogleSignInButton callbackUrl={callbackUrl} />
              <p className="mt-2 text-[12px] text-gray-500 dark:text-slate-400">
                By continuing, you agree to QwikSale’s{" "}
                <Link className="underline" href="/terms" prefetch={false}>
                  Terms
                </Link>{" "}
                and{" "}
                <Link className="underline" href="/privacy" prefetch={false}>
                  Privacy Policy
                </Link>
                .
              </p>
              <div className="mt-3 text-[12px] text-gray-500 dark:text-slate-400">
                Returning from a protected page? You’ll be sent back to{" "}
                <code className="font-mono">{callbackUrl}</code>.
              </div>
            </div>
          )}

          <div className="text-center text-xs text-gray-600 dark:text-slate-400">
            Prefer to browse first?{" "}
            <Link
              href="/"
              prefetch={false}
              className="underline underline-offset-2"
            >
              Continue as guest
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
