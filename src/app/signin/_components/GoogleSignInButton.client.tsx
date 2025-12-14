// src/app/signin/_components/GoogleSignInButton.client.tsx
"use client";

import * as React from "react";

type GoogleSignInButtonProps = {
  callbackUrl: string;
};

/**
 * Google sign-in entry:
 * - Renders a real <a> so Playwright and screen readers see a link.
 * - Does NOT call next-auth signIn() here to avoid extra bootstrap fetches.
 * - Falls back to the href if JS is dead (and is the primary path).
 */
export function GoogleSignInButton({ callbackUrl }: GoogleSignInButtonProps) {
  const [loading, setLoading] = React.useState(false);

  const safeCallback =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";

  const href = `/api/auth/signin/google?callbackUrl=${encodeURIComponent(
    safeCallback,
  )}`;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (loading) {
      e.preventDefault();
      return;
    }
    // Allow normal navigation to href (real document transition).
    setLoading(true);
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
