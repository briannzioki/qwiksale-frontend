// src/app/_components/Header.tsx

import { cookies as nextCookies } from "next/headers";
import HeaderClient from "@/app/components/HeaderClient";
import { getViewer } from "@/app/lib/auth";

/* ----------------------------- Cookie polyfill ----------------------------- */
async function readCookies() {
  const res: any = (nextCookies as any)();
  return typeof res?.then === "function" ? await res : res;
}

/** Check for any Auth.js/NextAuth-style session cookie server-side. */
async function hasAuthCookie() {
  const c: any = await readCookies();

  try {
    if (typeof c?.getAll === "function") {
      const all = c.getAll();
      return all.some((cookie: any) => {
        const name = String(cookie?.name ?? "").toLowerCase();
        return (
          // NextAuth legacy
          name === "next-auth.session-token" ||
          name === "__secure-next-auth.session-token" ||
          name === "__host-next-auth.session-token" ||
          name.startsWith("next-auth.session-token.") ||
          // Auth.js v5 common
          name === "authjs.session-token" ||
          name === "__secure-authjs.session-token" ||
          name === "__host-authjs.session-token" ||
          // Be generous: any auth/session style cookie counts as a hint
          (name.includes("auth") && name.includes("session"))
        );
      });
    }
  } catch {
    // fall through to direct checks
  }

  // Fallback: older / direct-name checks
  try {
    return Boolean(
      c?.get("__Secure-next-auth.session-token")?.value ||
        c?.get("__Host-next-auth.session-token")?.value ||
        c?.get("next-auth.session-token")?.value ||
        c?.get("__Secure-authjs.session-token")?.value ||
        c?.get("__Host-authjs.session-token")?.value ||
        c?.get("authjs.session-token")?.value,
    );
  } catch {
    return false;
  }
}

/**
 * Timebox getViewer() so cold starts don't stall the header render.
 * We still pass `isAuthed` from cookie hints to avoid “Sign in” flicker.
 */
async function getViewerWithTimeout(timeoutMs = 1800) {
  try {
    const winner = await Promise.race([
      getViewer().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return winner as unknown;
  } catch {
    return null;
  }
}

export default async function Header() {
  // Fast hint first (cheap): if no auth cookie, avoid getViewer() work.
  const cookieSuggestsSignedIn = await hasAuthCookie();

  const viewer = cookieSuggestsSignedIn ? await getViewerWithTimeout() : null;
  const viewerAny = viewer as any;

  const hasViewerIdentity = Boolean(
    viewerAny &&
      (viewerAny.id ||
        viewerAny.email ||
        viewerAny.user?.id ||
        viewerAny.user?.email ||
        viewerAny.session?.user?.id ||
        viewerAny.session?.user?.email),
  );

  const isAuthed = Boolean(hasViewerIdentity || cookieSuggestsSignedIn);

  const isAdmin = Boolean(
    viewerAny?.isAdmin ||
      viewerAny?.role === "admin" ||
      viewerAny?.session?.user?.isAdmin,
  );

  // Be defensive: different auth payloads may attach verification flags in different places.
  const isVerified = Boolean(
    viewerAny?.verified ||
      viewerAny?.isVerified ||
      viewerAny?.session?.user?.verified ||
      viewerAny?.session?.user?.isVerified,
  );

  return (
    <>
      {/* Skip link for accessibility */}
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
