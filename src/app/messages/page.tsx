// src/app/messages/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import MessagesClient from "./MessagesClient.client";

export default async function MessagesPage() {
  const [session, cookieStore] = await Promise.all([
    auth().catch(() => null),
    cookies(),
  ]);

  const uid = (session?.user as any)?.id as string | undefined;

  const hasAuthCookie = cookieStore.getAll().some((c) => {
    const name = (c.name ?? "").toLowerCase();
    return (
      name === "next-auth.session-token" ||
      name === "__secure-next-auth.session-token" ||
      name.startsWith("next-auth.session-token.") ||
      (name.includes("auth") && name.includes("session"))
    );
  });

  // If we have no uid:
  // - and no auth cookie → true guest: show Sign in CTA.
  // - and an auth cookie  → limbo: show soft error, no Sign in link.
  if (!uid) {
    if (!hasAuthCookie) {
      return (
        <div className="container-page py-10 space-y-4">
          <div className="rounded-2xl p-6 text-white shadow-soft dark:shadow-none bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue">
            <h1 className="text-2xl md:text-3xl font-extrabold">Messages</h1>
            <p className="text-white/90">
              Chat with buyers and sellers in real-time.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/80">
            <h2 className="text-xl font-semibold">You’re not signed in</h2>
            <p className="mt-2 text-gray-600 dark:text-slate-300">
              Please sign in to view your messages.
            </p>
            <div className="mt-4">
              <Link
                href={`/signin?callbackUrl=${encodeURIComponent("/messages")}`}
                prefetch={false}
                className="btn-gradient-primary inline-block"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // Limbo: API/Auth are confused but we *do* see an auth session cookie.
    // For the prod.no-auto-logout spec, this must NOT surface a "Sign in" link.
    return (
      <div className="container-page py-10 space-y-4">
        <div className="rounded-2xl p-6 text-white shadow-soft dark:shadow-none bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue">
          <h1 className="text-2xl md:text-3xl font-extrabold">Messages</h1>
          <p className="text-white/90">
            Chat with buyers and sellers in real-time.
          </p>
        </div>

        <div
          className="rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/80"
          data-soft-error="messages"
          data-e2e="messages-soft-error"
        >
          <h2 className="text-xl font-semibold">We couldn’t load your inbox</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
            Your session appears to be active, but we couldn&apos;t load your messages
            right now. Please refresh this page or navigate to another section. Your
            account menu in the header should remain available.
          </p>
        </div>
      </div>
    );
  }

  // Normal authenticated flow.
  return (
    <div className="container-page py-6 space-y-4">
      <div className="rounded-2xl p-6 text-white shadow-soft dark:shadow-none bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue">
        <h1 className="text-2xl md:text-3xl font-extrabold">Messages</h1>
        <p className="text-white/90">
          Chat with buyers and sellers in real-time.
        </p>
      </div>

      <section
        className="rounded-2xl border border-gray-200/80 bg-white/90 p-6 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/80"
        aria-label="Conversations"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          {/* No "Conversations" heading here to avoid duplicate heading names */}
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
            Inbox
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Your active chats will appear here. Start a conversation from any listing.
          </p>
        </div>
        <MessagesClient meId={uid} />
      </section>
    </div>
  );
}
