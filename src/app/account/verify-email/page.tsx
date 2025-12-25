// src/app/account/verify-email/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import SectionHeader from "@/app/components/SectionHeader";
import VerifyEmailClient from "./VerifyEmailClient";

export const metadata: Metadata = {
  title: "Verify your email · QwikSale",
  robots: { index: false, follow: false },
};

const SectionHeaderAny = SectionHeader as any;

export default function Page() {
  return (
    <main className="page-root bg-[var(--bg)] text-[var(--text)]">
      <SectionHeaderAny
        title="Verify your email"
        subtitle="Enter the code we send to your inbox to confirm this email address."
        gradient="brand"
      />
      <VerifyEmailClient />
    </main>
  );
}
