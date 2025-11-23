export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import SectionHeader from "@/app/components/SectionHeader";
import CompleteProfileClient from "./CompleteProfileClient";

export const metadata: Metadata = {
  title: "Complete your profile · QwikSale",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="page-root">
      <SectionHeader
        title="Complete your profile"
        subtitle="Add a username and contact details so buyers and sellers can reach you easily."
        gradient="brand"
      />
      <CompleteProfileClient />
    </main>
  );
}
