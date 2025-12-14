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
    <main className="container-page space-y-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">
          Your profile
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your account details, contact info, and store location used on your listings.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="card p-5 text-sm text-muted-foreground">
            Loading profile…
          </div>
        }
      >
        <ProfileClient />
      </Suspense>
    </main>
  );
}
