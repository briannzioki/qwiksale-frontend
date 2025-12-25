// src/app/goodbye/page.tsx
export const dynamic = "force-static";
export const revalidate = 3600;

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Goodbye 👋 · QwikSale",
  description:
    "Your QwikSale account has been deleted. We’re sorry to see you go.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/goodbye" },
};

export default function GoodbyePage() {
  return (
    <main className="container-page flex min-h-[70vh] max-w-2xl items-center justify-center py-4 sm:py-6">
      <div className="w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-sm">
        {/* Approved brand strip */}
        <div className="relative w-full bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white">
          <div className="container-page flex items-center gap-2 py-6 text-white sm:py-8">
            <span className="text-xl sm:text-2xl" aria-hidden>
              👋
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              Goodbye from QwikSale
            </h1>
          </div>
        </div>

        <div className="space-y-4 p-3.5 sm:p-6 md:p-8">
          <p className="text-base font-semibold text-[var(--text)] sm:text-lg">
            Your account has been deleted.
          </p>

          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            If this was a mistake, or you change your mind, you’re welcome back
            anytime. Your personal data has been scheduled for removal according
            to our{" "}
            <Link
              href="/privacy"
              className="underline decoration-[var(--border)] underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/" className="btn-gradient-primary text-center">
              Go to homepage
            </Link>
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent("/dashboard")}`}
              className="btn-outline text-center"
            >
              Create a new account / Sign in
            </Link>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-sm text-[var(--text)] shadow-sm sm:p-4">
            <p>
              Mind sharing why you left? A quick note helps us improve.{" "}
              <Link
                href="/help"
                className="font-semibold underline decoration-[var(--border)] underline-offset-2"
              >
                Contact support
              </Link>
              .
            </p>
          </div>

          <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
            If you deleted your account by accident, support can help within a
            short window.
          </p>
        </div>
      </div>
    </main>
  );
}
