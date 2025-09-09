// src/app/sell/page.tsx
import Link from "next/link";
import { getServerSession } from "@/app/lib/auth"; // centralized wrapper around auth()
import SellClient from "./SellClient";

/** Ensure auth is evaluated on each request (don’t statically cache this page). */
export const dynamic = "force-dynamic";

export default async function SellPage() {
  const session = await getServerSession();

  if (!session) {
    // No server redirect → show a friendly gate with a sign-in CTA
    const callbackUrl = encodeURIComponent("/sell");
    return (
      <div className="container-page py-8">
        <div className="mx-auto max-w-xl card-surface p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">Sign in required</h1>
            <p className="text-gray-700 dark:text-slate-300">
              You need to sign in to post a listing.
            </p>
          </div>

          <div className="flex gap-3">
            <Link href={`/signin?callbackUrl=${callbackUrl}`} className="btn-primary">
              Sign in
            </Link>
            <Link href="/" className="btn-ghost">
              Go back home
            </Link>
          </div>

          <p className="text-xs text-gray-500">
            By posting, you agree to our{" "}
            <Link href="/safety" className="underline">
              Safety Guidelines
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  // Authenticated → load the client form/flow
  return <SellClient />;
}
