// src/app/sell/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import SellClient from "./SellClient";

export default function SellPage() {
  // Middleware already enforces "must be signed in".
  // Rendering directly avoids the occasional SSR null-session loop.
  return <SellClient />;
}
