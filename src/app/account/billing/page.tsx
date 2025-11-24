// src/app/account/billing/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import UpgradePanel from "./UpgradePanel";

export const metadata: Metadata = {
  title: "Billing · QwikSale",
  robots: { index: false, follow: false },
};

type SubTier = "FREE" | "BASIC" | "GOLD" | "PLATINUM";

/** Row shape for the billing lookup */
type BillingRow = {
  id: string;
  subscription: SubTier | null;
  subscriptionUntil: Date | null;
};

function fmtDate(d?: Date | null) {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("en-KE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "Africa/Nairobi",
    }).format(new Date(d));
  } catch {
    return new Date(d as Date).toISOString().slice(0, 10);
  }
}

/** tiny Promise.race timeout */
function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  const t = new Promise<T>((resolve) => {
    tid = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.catch(() => fallback), t]).finally(() => {
    if (tid) clearTimeout(tid);
  }) as Promise<T>;
}

export default async function BillingPage() {
  const session = await auth().catch(() => null);
  const email = (session as any)?.user?.email as string | undefined;

  if (!email) {
    return (
      <main className="mx-auto max-w-xl p-6 text-gray-900 dark:text-slate-100">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-3 text-gray-700 dark:text-slate-200">
          You need to be signed in to manage your plan.
        </p>
        <Link
          href="/signin?callbackUrl=%2Faccount%2Fbilling"
          className="mt-4 inline-flex items-center justify-center rounded-2xl bg-[#161748] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#161748]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brandBlue focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
        >
          Sign in
        </Link>
      </main>
    );
  }

  // Fetch current plan/expiry for context (timeout guarded)
  const me = await withTimeout<BillingRow | null>(
    prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        subscription: true, // "FREE" | "BASIC" | "GOLD" | "PLATINUM" (nullable)
        subscriptionUntil: true, // Date | null
      },
    }),
    800,
    null,
  );

  const tier = ((me?.subscription as SubTier | null) ?? "FREE") as SubTier;
  const until = me?.subscriptionUntil ? fmtDate(me.subscriptionUntil) : null;

  const tierLabel =
    tier === "PLATINUM"
      ? "Platinum"
      : tier === "GOLD"
      ? "Gold"
      : tier === "BASIC"
      ? "Basic"
      : "Free";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 text-gray-900 dark:text-slate-100">
      <header>
        <h1 className="text-2xl font-semibold">Upgrade your plan</h1>
        <p className="mt-2 text-gray-600 dark:text-slate-300">
          Choose a plan and enter your M-Pesa number to receive an STK push.
        </p>
      </header>

      {/* Current plan summary */}
      <section className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/80">
        <div className="text-sm text-gray-700 dark:text-slate-200">
          Current plan:&nbsp;
          <strong>{tierLabel}</strong>
          {until && (
            <>
              {" · valid until "}
              <strong>{until}</strong>
            </>
          )}
        </div>
      </section>

      {/* Upgrade flow */}
      <UpgradePanel userEmail={email} />

      {/* Help / extras */}
      <section className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-slate-950/80">
        <h2 className="font-semibold text-gray-900 dark:text-slate-100">
          Need help?
        </h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 dark:text-slate-200">
          <li>
            If the STK prompt doesn’t arrive, confirm your phone is in{" "}
            <code className="rounded bg-gray-100 px-1 font-mono text-xs dark:bg-slate-900">
              2547XXXXXXXX
            </code>{" "}
            format and try again.
          </li>
          <li>
            You can also{" "}
            <Link
              href="/help"
              className="font-medium text-brandBlue underline-offset-4 hover:underline"
              prefetch={false}
            >
              contact support
            </Link>{" "}
            with your email and phone number.
          </li>
          <li>
            View{" "}
            <Link
              href="/settings/billing"
              className="font-medium text-brandBlue underline-offset-4 hover:underline"
              prefetch={false}
            >
              billing settings &amp; history
            </Link>{" "}
            (coming soon).
          </li>
        </ul>
      </section>
    </main>
  );
}
