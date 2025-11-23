// src/app/signin/_components/GoogleSignInButton.client.tsx
"use client";

import * as React from "react";
import { signIn } from "next-auth/react";

type GoogleSignInButtonProps = {
  callbackUrl: string;
};

/**
 * Google sign-in entry:
 * - Renders a real <a> so Playwright and screen readers see a link.
 * - Intercepts click to use next-auth's signIn("google") helper.
 * - Falls back to the href if JS is dead.
 */
export function GoogleSignInButton({ callbackUrl }: GoogleSignInButtonProps) {
  const [loading, setLoading] = React.useState(false);

  const safeCallback = callbackUrl && callbackUrl.startsWith("/")
    ? callbackUrl
    : "/dashboard";

  const href = `/api/auth/signin/google?callbackUrl=${encodeURIComponent(
    safeCallback,
  )}`;

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await signIn("google", {
        redirect: true,
        callbackUrl: safeCallback,
      });
      // With redirect: true, we almost never resume here.
    } finally {
      setLoading(false);
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className="btn-outline w-full py-3 text-center"
      aria-label="Continue with Google"
      // Playwright expects a *link* with this text:
      // getByRole('link', { name: /continue with google/i })
    >
      {loading ? "Starting Google sign-in…" : "Continue with Google"}
    </a>
  );
}
