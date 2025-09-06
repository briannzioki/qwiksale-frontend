// src/app/goodbye/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Goodbye 👋 · QwikSale",
  robots: { index: false, follow: false },
};

export default function GoodbyePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center p-6">
      <div className="w-full overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Top strip / illustration */}
        <div className="relative h-24 w-full bg-gradient-to-r from-[#161748] via-[#1d2b64] to-[#0b1220]">
          <div className="absolute -top-10 right-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute inset-y-0 left-0 flex items-center gap-2 px-6 text-white/95">
            <span className="text-2xl">👋</span>
            <h1 className="text-xl font-semibold tracking-tight">Goodbye from QwikSale</h1>
          </div>
        </div>

        <div className="space-y-5 p-6 md:p-8">
          <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Your account has been deleted.
          </p>

          <p className="text-sm leading-relaxed text-gray-600 dark:text-slate-300">
            We’re genuinely sorry to see you go. If this was a mistake—or you change your
            mind—you’re always welcome back. Your privacy matters to us: any personal data
            associated with your account has been scheduled for removal according to our{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>

          {/* Gentle nudge / options */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl bg-[#161748] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 active:scale-[.99]"
            >
              Go to homepage
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center justify-center rounded-2xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 active:scale-[.99] dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Create a new account / Sign in
            </Link>
          </div>

          {/* Feedback + help */}
          <div className="rounded-2xl border border-gray-200 p-4 text-sm text-gray-700 dark:border-slate-800 dark:text-slate-300">
            <p>
              Mind sharing why you left? A quick note helps us improve.{" "}
              <Link href="/support" className="font-medium underline underline-offset-2">
                Contact support
              </Link>
              .
            </p>
          </div>

          <p className="text-[12px] text-gray-500 dark:text-slate-400">
            If you deleted your account by accident, support can help within a short window of time.
          </p>
        </div>
      </div>
    </main>
  );
}
