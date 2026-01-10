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

const DEFAULT_AFTER_SIGNIN = "/dashboard";

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
    const out = `${u.pathname}${u.search}${u.hash}`;
    return out.startsWith("/") ? out : fallback;
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

function first(sp: SearchParams15, key: string): string {
  const v = (sp as any)?.[key];
  if (Array.isArray(v)) return String(v[0] ?? "");
  if (typeof v === "string") return v;
  return "";
}

function hasGoogleEnvConfigured(): boolean {
  const idKeys = ["GOOGLE_CLIENT_ID", "AUTH_GOOGLE_ID", "NEXT_PUBLIC_GOOGLE_CLIENT_ID"] as const;
  const secretKeys = ["GOOGLE_CLIENT_SECRET", "AUTH_GOOGLE_SECRET"] as const;

  const hasId = idKeys.some((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });

  const hasSecret = secretKeys.some((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });

  return hasId && hasSecret;
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams15> }) {
  const sp = await searchParams;

  const rawCb = first(sp, "callbackUrl");
  const decodedCb = decodeUpToTwo(rawCb);
  const callbackUrl = sanitizeCallback(decodedCb, DEFAULT_AFTER_SIGNIN);

  // Keep errors generic for Playwright and security (do not leak account existence or auth method).
  const rawErr = first(sp, "error") || null;
  const friendly = rawErr ? "Sign-in failed. Please try again." : null;

  // In non-production, keep Google visible (even if env vars are missing).
  // In production, only show Google when configured.
  const showGoogle = process.env.NODE_ENV !== "production" || hasGoogleEnvConfigured();

  // Convenience only; CredentialsForm removes any email/password params from the URL on mount.
  const emailFromQuery = first(sp, "email").trim();
  const defaultEmail = emailFromQuery ? emailFromQuery : undefined;

  // exactOptionalPropertyTypes: do not pass `undefined` explicitly for optional props.
  const credsProps: { callbackUrl: string; defaultEmail?: string } = {
    callbackUrl,
    ...(defaultEmail ? { defaultEmail } : {}),
  };

  const signupHref = `/signup?return=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="container-page py-4 text-[var(--text)] sm:py-8">
      <div className="mx-auto max-w-xl" aria-label="Sign in page">
        <div className="rounded-2xl bg-gradient-to-r from-[var(--brand-navy)] via-[var(--brand-green)] to-[var(--brand-blue)] text-white shadow-soft">
          <div className="container-page py-5 text-white sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              Sign in to QwikSale
            </h1>
            <p className="mt-1 text-[11px] leading-relaxed text-white/80 sm:text-sm">
              {showGoogle
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
          <CredsFormClient {...credsProps} />

          {showGoogle && (
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
                <code className="font-mono text-[var(--text)]">{callbackUrl}</code>.
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-center shadow-soft sm:p-5">
            <div className="text-sm font-semibold text-[var(--text)]">New to QwikSale?</div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              Create an account in under a minute. You’ll be sent back to{" "}
              <code className="font-mono text-[var(--text)]">{callbackUrl}</code> after signup.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Link href={signupHref} prefetch={false} className="btn-outline">
                Create an account
              </Link>
              <Link href="/" prefetch={false} className="btn-outline">
                Continue as guest
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
