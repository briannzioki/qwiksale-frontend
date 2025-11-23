// src/app/_components/HomeClientNoSSR.tsx
"use client";

import dynamic from "next/dynamic";
import * as React from "react";

/** With exactOptionalPropertyTypes, optional ≠ includes undefined,
 *  so we explicitly allow `| undefined`.
 */
export type HomeSeedProps = {
  productId?: string | undefined;
  serviceId?: string | undefined;
};

/** Dynamically import the real client with SSR disabled. */
const HomeClient = dynamic<any>(
  () => import("./HomeClient").then((m: any) => m.default ?? m),
  {
    ssr: false,
    loading: () => (
      <div
        aria-label="Loading home feed"
        className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground"
      >
        Loading…
      </div>
    ),
  },
);

/** Properly typed wrapper that accepts seeds. */
export default function HomeClientNoSSR(props: HomeSeedProps) {
  return <HomeClient {...props} />;
}
