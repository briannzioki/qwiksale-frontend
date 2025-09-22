// src/app/account/profile/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = {
  title: "Your Profile | QwikSale",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <ProfileClient />
    </Suspense>
  );
}
