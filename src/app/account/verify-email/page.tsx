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

export default function Page() {
  return (
    <main className="page-root">
      <SectionHeader
        title="Verify your email"
        subtitle="Enter the code we send to your inbox to confirm this email address."
        gradient="brand"
      />
      <VerifyEmailClient />
    </main>
  );
}
