// src/app/account/billing/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import UpgradePanel from "./UpgradePanel";

export const metadata: Metadata = {
  title: "Billing | QwikSale",
  robots: { index: false, follow: false },
};

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
          href="/signin"
          className="mt-4 inline-block rounded-2xl bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Upgrade your plan</h1>
      <p className="mt-2 text-gray-600">
        Choose a plan and enter your M-Pesa number to receive an STK push.
      </p>
      {/* Client component */}
      <UpgradePanel userEmail={email} />
    </main>
  );
}
