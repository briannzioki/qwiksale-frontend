// src/app/_components/HomeClientNoSSR.tsx
"use client";

import dynamic from "next/dynamic";
import * as React from "react";

// (Type-only import to keep things safe if HomeClient gets props later)
import type HomeClient from "./HomeClient";
type HomeClientProps = React.ComponentProps<typeof HomeClient>;

const HomeClientNoSSR = dynamic<HomeClientProps>(() => import("./HomeClient"), {
  ssr: false,
  loading: () => (
    <div className="p-4 text-sm text-gray-500 dark:text-slate-400">
      Loading…
    </div>
  ),
});

export default HomeClientNoSSR;
