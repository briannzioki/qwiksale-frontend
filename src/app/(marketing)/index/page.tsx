// src/app/(marketing)/index/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QwikSale — Buy & Sell Locally, Fast",
  // Avoid duplicate content: keep /index out of the index, canonical is "/"
  robots: { index: false, follow: false },
  alternates: { canonical: "/" },
};

export default function IndexRedirect() {
  redirect("/");
}
