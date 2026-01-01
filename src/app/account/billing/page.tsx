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

  const me = await withTimeout<BillingRow | null>(
    prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        subscription: true,
        subscriptionUntil: true,
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

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 shadow-soft">
        <div className="text-xs sm:text-sm text-[var(--text-muted)]">
          Current plan:{" "}
          <strong className="font-semibold text-[var(--text)]">{tierLabel}</strong>
          {until && (
            <>
              {" "}
              <span>valid until </span>
              <strong className="font-semibold text-[var(--text)]">{until}</strong>
            </>
          )}
        </div>
      </section>

      <UpgradePanel userEmail={email} />

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 shadow-soft">
        <h2 className="text-sm sm:text-base font-semibold text-[var(--text)]">Need help?</h2>
        <ul className="mt-2 list-disc pl-5 text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
          <li>
            If the STK prompt does not arrive, confirm your phone is in{" "}
            <code className="rounded bg-[var(--bg-subtle)] px-1 font-mono text-xs text-[var(--text)]">
              2547XXXXXXXX
            </code>{" "}
            format and try again.
          </li>
          <li>
            You can{" "}
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
              billing settings and history
            </Link>{" "}
            (coming soon).
          </li>
        </ul>
      </section>
    </main>
  );
}
