// src/app/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import HomeClient from "./_components/HomeClient";

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
        <HomeClient />
      </Suspense>
    </main>
  );
}
