// src/app/messages/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { cookies as nextCookies } from "next/headers";
import { getSessionUser } from "@/app/lib/authz";
import MessagesClient from "./MessagesClient.client";

/* ----------------------------- Cookie polyfill ----------------------------- */
/**
 * Next 15 may return cookies() as a Promise; older versions return it sync.
 * This helper normalizes it so we can safely call .getAll().
 */
async function readCookies() {
  const res: any = (nextCookies as any)();
  return typeof res?.then === "function" ? await res : res;
}

export default async function MessagesPage() {
  const [cookieStore, viewer] = await Promise.all([
    readCookies(),
    getSessionUser(),
  ]);

  const viewerAny = (viewer ?? {}) as any;

  const sessionId =
    viewerAny && viewerAny.id != null ? String(viewerAny.id) : null;
  const sessionEmail =
    typeof viewerAny?.email === "string" ? viewerAny.email : null;

  const hasSessionIdentity = Boolean(sessionId || sessionEmail);

  const hasAuthCookie = cookieStore.getAll().some((c: any) => {
    const name = String(c?.name ?? "").toLowerCase();
    return (
      name === "next-auth.session-token" ||
      name === "__secure-next-auth.session-token" ||
      name.startsWith("next-auth.session-token.") ||
      (name.includes("auth") && name.includes("session"))
    );
  });

  const heroClass =
    "rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft";

  // phone-first padding; restore on sm+
  const panelClass =
    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 shadow-soft sm:p-6";

  const ctaButtonClass =
    "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text)] shadow-soft transition hover:bg-[var(--bg-elevated)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm";

  // --------------------- Unauthenticated / limbo states --------------------- //
  if (!hasSessionIdentity) {
    // True guest / unauthenticated: show explicit Sign in CTA.
    if (!hasAuthCookie) {
      return (
        <main
          id="main"
          className="space-y-3 bg-[var(--bg)] py-4 sm:space-y-4 sm:py-6"
        >
          <div className={heroClass}>
            <div className="container-page py-6 text-white sm:py-8">
              <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
                Messages
              </h1>
              <p className="mt-1 text-xs text-white/80 sm:text-sm">
                Chat with buyers and sellers in real-time.
              </p>
            </div>
          </div>

          <div className="container-page">
            <div className={panelClass}>
              <h2 className="text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
                You’re not signed in
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)] sm:mt-2">
                Please sign in to view your messages.
              </p>
              <div className="mt-3 sm:mt-4">
                <Link
                  href={`/signin?callbackUrl=${encodeURIComponent("/messages")}`}
                  prefetch={false}
                  className={ctaButtonClass}
                  aria-label="View your messages (login required)"
                >
                  Sign in to view your messages
                </Link>
              </div>
            </div>
          </div>
        </main>
      );
    }

    // Limbo: we see an auth cookie but no session identity.
    // For the prod.no-auto-logout spec, this must NOT surface a "Sign in" link.
    return (
      <main
        id="main"
        className="space-y-3 bg-[var(--bg)] py-4 sm:space-y-4 sm:py-6"
      >
        <div className={heroClass}>
          <div className="container-page py-6 text-white sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              Messages
            </h1>
            <p className="mt-1 text-xs text-white/80 sm:text-sm">
              Chat with buyers and sellers in real-time.
            </p>
          </div>
        </div>

        <div className="container-page">
          <div
            className={panelClass}
            data-soft-error="messages"
            data-e2e="messages-soft-error"
          >
            <h2 className="text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
              We couldn’t load your inbox
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)] sm:mt-2">
              Your session appears to be active, but we couldn&apos;t load things
              right now. Please refresh this page or navigate to another section.
              Your account menu in the header should remain available.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ----------------------------- Authenticated UI ---------------------------- //
  const meId = sessionId || undefined;

  return (
    <main
      id="main"
      className="space-y-3 bg-[var(--bg)] py-4 sm:space-y-4 sm:py-6"
    >
      <div className={heroClass}>
        <div className="container-page py-6 text-white sm:py-8">
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
            Messages
          </h1>
          <p className="mt-1 text-xs text-white/80 sm:text-sm">
            Chat with buyers and sellers in real-time.
          </p>
        </div>
      </div>

      <div className="container-page">
        <section className={panelClass} aria-label="Conversations">
          <div className="mb-3 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">Inbox</p>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Your active chats will appear here. Start a conversation from any
              listing.
            </p>
          </div>

          {meId ? <MessagesClient meId={meId} /> : <MessagesClient />}
        </section>
      </div>
    </main>
  );
}
