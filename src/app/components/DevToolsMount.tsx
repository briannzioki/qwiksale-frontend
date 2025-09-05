"use client";

import dynamic from "next/dynamic";

// Load only on the client, never SSR
const DevSentryTest = dynamic(() => import("./DevSentryTest"), { ssr: false });

export default function DevToolsMount() {
  // Show in non-prod by default. To show in prod, set NEXT_PUBLIC_SHOW_DEV_TEST=1
  const show =
    process.env.NEXT_PUBLIC_SHOW_DEV_TEST === "1" ||
    process.env.NODE_ENV !== "production";

  if (!show) return null;
  return <DevSentryTest />;
}
