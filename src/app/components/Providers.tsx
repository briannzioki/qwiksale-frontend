"use client";

import React from "react";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

type Props = {
  /** Children of the app */
  children: React.ReactNode;
  /**
   * If you fetch the session on the server (e.g. in layout)
   * you can pass it here to avoid an extra client round-trip.
   */
  session?: Session | null;
  /**
   * How often to refetch the session on the client (in seconds).
   * Useful for reflecting subscription changes shortly after M-Pesa callbacks.
   * Set to 0 to disable periodic refetching. Default: 120s.
   */
  refetchIntervalSec?: number;
  /**
   * Whether to refetch the session when the window regains focus.
   * Default: true.
   */
  refetchOnWindowFocus?: boolean;
  /**
   * Remount subtree when identity changes to clear user-scoped client state.
   * Default: true.
   */
  remountOnUserChange?: boolean;
};

export default function Providers({
  children,
  session = null,
  refetchIntervalSec = 120,
  refetchOnWindowFocus = true,
  remountOnUserChange = true,
}: Props) {
  // Using a key on the provider will remount its subtree when the user changes.
  // This helps reset client caches/stores specific to a user after sign in/out.
  const identityKey = remountOnUserChange
    ? (session?.user?.email ?? "anon")
    : "stable";

  return (
    <SessionProvider
      key={identityKey}
      session={session ?? undefined}
      refetchInterval={Math.max(0, refetchIntervalSec)}
      refetchOnWindowFocus={refetchOnWindowFocus}
    >
      {children}
    </SessionProvider>
  );
}
