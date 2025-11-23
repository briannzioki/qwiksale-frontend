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

function resolveBaseUrl(): string {
  const env =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    process.env["NEXTAUTH_URL"] ||
    process.env["VERCEL_URL"] ||
    "";
  if (env) {
    try {
      const u = env.startsWith("http") ? new URL(env) : new URL(`https://${env}`);
      return u.origin;
    } catch {
      // ignore
    }
  }
  return "http://localhost:3000";
}

/** Timeboxed CSRF fetch; falls back to null on slow/cold starts. */
async function getCsrfTokenServer(timeoutMs = 3200): Promise<string | null> {
  const base = resolveBaseUrl();
  const ctrl = new AbortController();
  const tid = setTimeout(() => {
    try {
      ctrl.abort();
    } catch {
      // ignore
    }
  }, Math.max(200, timeoutMs));

  try {
    const res = await fetch(new URL("/api/auth/csrf", base).toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as any;
    return j?.csrfToken ?? j?.csrf?.token ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

/** Timeboxed providers fetch; used to decide whether to show Google button. */
async function getAuthProvidersServer(
  timeoutMs = 3200,
): Promise<Record<string, unknown> | null> {
  const base = resolveBaseUrl();
  const ctrl = new AbortController();
  const tid = setTimeout(() => {
    try {
      ctrl.abort();
    } catch {
      // ignore
    }
  }, Math.max(200, timeoutMs));

  try {
    const res = await fetch(new URL("/api/auth/providers", base).toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as any;
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
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

  const [csrfToken, providers] = await Promise.all([
    getCsrfTokenServer(),
    getAuthProvidersServer(),
  ]);

  // Use indexer access to satisfy TS4111
  const hasGoogle = !!(providers && providers["google"]);

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
            csrfFromServer={csrfToken ?? ""}
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
