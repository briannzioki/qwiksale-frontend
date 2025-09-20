"use client";

import dynamic from "next/dynamic";

// Render HomeClient only on the client (no SSR)
const HomeClientNoSSR = dynamic(() => import("./HomeClient"), { ssr: false });

export default HomeClientNoSSR;
