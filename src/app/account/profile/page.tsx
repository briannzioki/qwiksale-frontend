import { Suspense } from "react";
import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Your Profile | QwikSale",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="container-page space-y-4 bg-[var(--bg)] py-4 sm:py-6 text-[var(--text)]">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text)]">
          Your profile
        </h1>
        <p className="text-xs sm:text-sm leading-relaxed text-[var(--text-muted)]">
          Update your account details, contact info, and store location used on
          your listings.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-5 text-xs sm:text-sm text-[var(--text-muted)] shadow-sm">
            Loading profile…
          </div>
        }
      >
        <ProfileClient />
      </Suspense>
    </main>
  );
}
