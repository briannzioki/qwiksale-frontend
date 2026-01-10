"use client";

import * as React from "react";
import { signIn } from "next-auth/react";

type GoogleSignInButtonProps = {
  callbackUrl: string;
};

const DEFAULT_AFTER_SIGNIN = "/dashboard";

function isSafePath(p?: string | null): p is string {
  return !!p && /^\/(?!\/)/.test(p);
}

function sanitizeCallback(raw: string, fallback: string): string {
  const v = String(raw || "").trim();
  const path = isSafePath(v) ? v : fallback;

  const lower = path.toLowerCase();
  if (lower === "/signin" || lower.startsWith("/signin?")) return fallback;
  if (lower.startsWith("/api/auth")) return fallback;

  return path;
}

/**
 * Google sign-in entry:
 * - MUST be an <a> (role="link").
 * - Uses next-auth/react signIn("google") with redirect:true to leave /signin on success.
 * - Keeps href as a hard fallback.
 */
export function GoogleSignInButton({ callbackUrl }: GoogleSignInButtonProps) {
  const [loading, setLoading] = React.useState(false);

  const safeCallback = sanitizeCallback(callbackUrl, DEFAULT_AFTER_SIGNIN);
  const href = `/api/auth/signin/google?callbackUrl=${encodeURIComponent(safeCallback)}`;

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    if (loading) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    setLoading(true);

    try {
      await signIn(
        "google",
        {
          redirect: true,
          callbackUrl: safeCallback,
          redirectTo: safeCallback,
        } as any,
      );
    } catch {
      window.location.href = href;
    } finally {
      setLoading(false);
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-label="Continue with Google"
      aria-disabled={loading ? "true" : "false"}
      className={[
        "flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 py-3 font-semibold",
        "bg-[var(--bg-elevated)] text-[var(--text)] text-xs sm:text-sm",
        "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]",
        loading ? "pointer-events-none opacity-60" : "",
      ].join(" ")}
    >
      <GoogleIcon className="h-5 w-5" />
      {loading ? "Opening Google…" : "Continue with Google"}
    </a>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" {...props} aria-hidden>
      <path
        fill="currentColor"
        d="M43.611 20.083H42V20H24v8h11.303C33.826 32.599 29.28 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.152 7.961 3.039l5.657-5.657C33.64 6.053 28.999 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"
      />
      <path
        fill="currentColor"
        d="M6.306 14.691l6.571 4.817C14.48 16.064 18.883 14 24 14c3.059 0 5.842 1.152 7.961 3.039l5.657-5.657C33.64 6.053 28.999 4 24 4 16.318 4 9.657 8.337 6.306 14.691z"
      />
      <path
        fill="currentColor"
        d="M24 44c5.227 0 9.941-1.997 13.515-5.261l-6.231-5.274C29.24 34.737 26.747 36 24 36c-5.255 0-9.79-3.381-11.396-8.078l-6.52 5.02C9.386 39.63 16.13 44 24 44z"
      />
      <path
        fill="currentColor"
        d="M43.611 20.083H42V20H24v8h11.303c-1.151 3.247-3.557 5.833-6.519 7.382l.003-.002 6.231 5.274C37.617 38.079 40 32.666 40 27c0-2.356-.389-4.621-1.111-6.917z"
      />
    </svg>
  );
}
