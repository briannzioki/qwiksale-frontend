// src/app/providers.tsx
"use client";

import React from "react";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

type Props = {
  children: React.ReactNode;
  session?: Session | null;
  refetchIntervalSec?: number;
  refetchOnWindowFocus?: boolean;
  remountOnUserChange?: boolean;
};

// Minimal shape we rely on for deriving a stable key
type SessionLike = {
  user?: { email?: string | null } | null;
} | null;

export default function Providers({
  children,
  session = null,
  refetchIntervalSec = 120,
  refetchOnWindowFocus = true,
  remountOnUserChange = true,
}: Props) {
  // Derive a key that remounts subtree when identity changes.
  const identityKey = remountOnUserChange
    ? (((session as SessionLike)?.user?.email as string | null | undefined) ?? "anon")
    : "stable";

  return (
    <SessionProvider
      key={identityKey}
      // cast is fine; SessionProvider accepts undefined|null too
      session={session as Session | undefined}
      refetchInterval={Math.max(0, refetchIntervalSec)}
      refetchOnWindowFocus={refetchOnWindowFocus}
    >
      {children}
    </SessionProvider>
  );
}
