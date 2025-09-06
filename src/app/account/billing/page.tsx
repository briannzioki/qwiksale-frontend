// src/app/account/billing/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import UpgradePanel from "./UpgradePanel";

export const metadata: Metadata = {
  title: "Billing | QwikSale",
  robots: { index: false, follow: false },
};

type SubTier = "BASIC" | "GOLD" | "PLATINUM";

function fmtDate(d?: Date | null) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

export default async function BillingPage() {
  const session = await auth().catch(() => null);
  const email = (session as any)?.user?.email as string | undefined;

  if (!email) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-3 text-gray-700">
          You need to be signed in to manage your plan.
        </p>
        <Link
          href="/signin?callbackUrl=%2Faccount%2Fbilling"
          className="mt-4 inline-block rounded-2xl bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
        >
          Sign in
        </Link>
      </main>
    );
  }

  // Fetch current plan/expiry for context
  const me = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      subscription: true,          // "BASIC" | "GOLD" | "PLATINUM" (or "FREE" in some schemas)
      subscriptionUntil: true,     // Date | null
    },
  });

  const tier = (me?.subscription ?? "BASIC") as SubTier;
  const until = me?.subscriptionUntil ? fmtDate(me.subscriptionUntil) : null;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Upgrade your plan</h1>
        <p className="mt-2 text-gray-600">
          Choose a plan and enter your M-Pesa number to receive an STK push.
        </p>
      </header>

      {/* Current plan summary */}
      <section className="rounded-2xl border border-gray-200 p-4">
        <div className="text-sm text-gray-700">
          Current plan:&nbsp;
          <strong>
            {tier === "BASIC" ? "Basic" : tier === "GOLD" ? "Gold" : "Platinum"}
          </strong>
          {until && (
            <>
              &nbsp;•&nbsp;valid until <strong>{until}</strong>
            </>
          )}
        </div>
      </section>

      {/* Upgrade flow */}
      <UpgradePanel userEmail={email} />

      {/* Help / extras */}
      <section className="rounded-2xl border border-gray-200 p-4">
        <h2 className="font-semibold">Need help?</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
          <li>
            If the STK prompt doesn’t arrive, confirm your phone is in{" "}
            <code className="px-1 rounded bg-gray-100">2547XXXXXXXX</code> format and try again.
          </li>
          <li>
            You can also{" "}
            <Link href="/support" className="underline">
              contact support
            </Link>{" "}
            with your email and phone number.
          </li>
          <li>
            View{" "}
            <Link href="/account/billing/history" className="underline">
              payment history
            </Link>{" "}
            (coming soon).
          </li>
        </ul>
      </section>
    </main>
  );
}
