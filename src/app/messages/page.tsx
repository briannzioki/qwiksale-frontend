export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { auth } from "@/auth";
import MessagesClient from "./MessagesClient.client";

export default async function MessagesPage() {
  const session = await auth().catch(() => null);
  const uid = (session?.user as any)?.id as string | undefined;

  // No redirect here — render a safe sign-in screen if unauthenticated.
  // Middleware already guards /messages during real document navigations.
  if (!uid) {
    return (
      <div className="container-page py-10 space-y-4">
        <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
          <h1 className="text-2xl md:text-3xl font-extrabold">Messages</h1>
          <p className="text-white/90">Chat with buyers and sellers in real-time.</p>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

  return (
    <div className="container-page py-6 space-y-4">
      <div className="rounded-2xl p-6 text-white shadow bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]">
        <h1 className="text-2xl md:text-3xl font-extrabold">Messages</h1>
        <p className="text-white/90">Chat with buyers and sellers in real-time.</p>
      </div>

      <MessagesClient meId={uid} />
    </div>
  );
}
