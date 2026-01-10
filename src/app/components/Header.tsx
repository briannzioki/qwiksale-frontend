// src/app/components/Header.tsx
"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import HeaderClient from "@/app/components/HeaderClient";

/**
 * Client-safe header wrapper.
 *
 * Why: AppShell is a Client Component and imports Header. Server-only APIs like
 * `next/headers` cannot be used under a client parent.
 *
 * We rely on next-auth's client session to drive auth state. HeaderClient already
 * honors the hint to reduce UI flicker when the session is already hydrated.
 */
export default function Header() {
  const { status, data: session } = useSession();

  const isAuthed = status === "authenticated" && !!session;

  // Be defensive: session shapes vary across NextAuth/Auth.js setups.
  const userAny = (session as any)?.user ?? null;

  const roleU = String(userAny?.role ?? "").toUpperCase();
  const isAdmin = Boolean(
    userAny?.isAdmin === true ||
      userAny?.isSuperAdmin === true ||
      roleU === "ADMIN" ||
      roleU === "SUPERADMIN",
  );

  const isVerified = Boolean(
    userAny?.verified === true ||
      userAny?.emailVerified === true ||
      userAny?.isVerified === true,
  );

  return (
    <>
      <a
        href="#main"
        className={[
          "sr-only",
          "focus:not-sr-only focus:fixed focus:top-3 focus:left-3 z-50",
          "px-3 py-2 rounded-xl",
          "bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border-subtle)] shadow-soft",
          "focus:outline-none ring-offset-2 ring-offset-white dark:ring-offset-slate-900 focus-visible:ring-2 ring-focus",
        ].join(" ")}
      >
        Skip to content
      </a>

      <HeaderClient
        initialAuth={{
          isAuthed,
          isAdmin,
          isVerified,
        }}
      />
    </>
  );
}
