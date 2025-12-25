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
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
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
      <main className="container-page max-w-xl py-4 sm:py-6 text-[var(--text)]">
        <header className="space-y-1.5 sm:space-y-2">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text)]">
            Billing
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-muted)] leading-relaxed">
            You need to be signed in to manage your plan.
          </p>
        </header>

        <div className="mt-4 sm:mt-5">
          <Link
            href="/signin?callbackUrl=%2Faccount%2Fbilling"
            className={[
              "inline-flex min-h-9 items-center justify-center",
              "rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold",
              "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
              "shadow-soft transition",
              "hover:bg-[var(--bg-subtle)]",
              "active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
          >
            Sign in
          </Link>
        </div>
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
    <main className="container-page max-w-2xl space-y-4 sm:space-y-6 py-4 sm:py-6 text-[var(--text)]">
      <header className="space-y-1.5 sm:space-y-2">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text)]">
          Upgrade your plan
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-muted)] leading-relaxed">
          Choose a plan and enter your M-Pesa number to receive an STK push.
        </p>
      </header>

      {/* Current plan summary */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 shadow-soft">
        <div className="text-xs sm:text-sm text-[var(--text-muted)]">
          Current plan:&nbsp;
          <strong className="font-semibold text-[var(--text)]">{tierLabel}</strong>
          {until && (
            <>
              {" · valid until "}
              <strong className="font-semibold text-[var(--text)]">{until}</strong>
            </>
          )}
        </div>
      </section>

      {/* Upgrade flow */}
      <UpgradePanel userEmail={email} />

      {/* Help / extras */}
      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 shadow-soft">
        <h2 className="text-sm sm:text-base font-semibold text-[var(--text)]">Need help?</h2>
        <ul className="mt-2 list-disc pl-5 text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
          <li>
            If the STK prompt doesn’t arrive, confirm your phone is in{" "}
            <code className="rounded bg-[var(--bg-subtle)] px-1 font-mono text-xs text-[var(--text)]">
              2547XXXXXXXX
            </code>{" "}
            format and try again.
          </li>
          <li>
            You can also{" "}
            <Link
              href="/help"
              className="font-semibold text-[var(--text)] underline underline-offset-4 hover:opacity-90"
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
              className="font-semibold text-[var(--text)] underline underline-offset-4 hover:opacity-90"
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
