export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import CompleteProfileClient from "./CompleteProfileClient";

export const metadata: Metadata = {
  title: "Complete your profile | QwikSale",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CompleteProfileClient />;
}
