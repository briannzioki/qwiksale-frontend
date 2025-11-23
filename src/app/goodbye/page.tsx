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
    <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center p-6">
      <div className="w-full overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="relative h-24 w-full bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue">
          <div className="absolute inset-y-0 left-0 flex items-center gap-2 px-6 text-white/95">
            <span className="text-2xl" aria-hidden>
              👋
            </span>
            <h1 className="text-xl font-semibold tracking-tight">
              Goodbye from QwikSale
            </h1>
          </div>
        </div>

        <div className="space-y-5 p-6 md:p-8">
          <p className="text-lg font-semibold text-foreground">
            Your account has been deleted.
          </p>

          <p className="text-sm leading-relaxed text-muted-foreground">
            If this was a mistake—or you change your mind—you’re welcome back
            anytime. Your personal data has been scheduled for removal according
            to our{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/"
              className="btn-gradient-primary text-center"
            >
              Go to homepage
            </Link>
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent("/dashboard")}`}
              className="btn-outline text-center"
            >
              Create a new account / Sign in
            </Link>
          </div>

          <div className="rounded-2xl border border-border p-4 text-sm text-foreground">
            <p>
              Mind sharing why you left? A quick note helps us improve.{" "}
              <Link
                href="/help"
                className="font-medium underline underline-offset-2"
              >
                Contact support
              </Link>
              .
            </p>
          </div>

          <p className="text-[12px] text-muted-foreground">
            If you deleted your account by accident, support can help within a
            short window.
          </p>
        </div>
      </div>
    </main>
  );
}
