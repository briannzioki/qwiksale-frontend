export const dynamic = "force-static";
export const revalidate = 600;
export const runtime = "nodejs";

import { Suspense } from "react";
import HomeClientNoSSR from "./_components/HomeClientNoSSR";

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
        <HomeClientNoSSR />
      </Suspense>
    </main>
  );
}
