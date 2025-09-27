// src/app/_components/HomeClientNoSSR.tsx
"use client";

import dynamic from "next/dynamic";
import * as React from "react";

/** Keep props in sync with the actual HomeClient default export without importing it at runtime */
type HomeClientProps = React.ComponentPropsWithoutRef<
  typeof import("./HomeClient").default
>;

const HomeClientNoSSR = dynamic<HomeClientProps>(() => import("./HomeClient"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="p-4 text-sm text-gray-500 dark:text-slate-400"
    >
      Loading…
    </div>
  ),
});

export default HomeClientNoSSR;
