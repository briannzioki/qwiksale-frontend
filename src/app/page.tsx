// src/app/page.tsx
export const dynamic = "force-static";
export const revalidate = 600;
export const runtime = "nodejs";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";

// render client code only on the client
const HomeClient = nextDynamic(() => import("./_components/HomeClient"), { ssr: false });

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
        <HomeClient />
      </Suspense>
    </main>
  );
}
