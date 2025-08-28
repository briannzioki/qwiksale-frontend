"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Avoid aggressive refetches causing flicker when switching tabs
      refetchOnWindowFocus={false}
      // Poll rarely; your /api/me endpoint can be used for explicit refresh
      refetchInterval={0}
    >
      <Suspense fallback={<PageLoader />}>{children}</Suspense>

      {/* Global toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          // Subtle defaults that match your Tailwind brand palette
          style: {
            borderRadius: "12px",
            padding: "10px 12px",
            background: "#ffffff",
            color: "#111827",
            boxShadow:
              "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
          },
          success: {
            style: { borderLeft: "4px solid #478559" }, // brandGreen
          },
          error: {
            style: { borderLeft: "4px solid #f95d9b" }, // brandPink
          },
          loading: {
            style: { borderLeft: "4px solid #39a0ca" }, // brandBlue
          },
        }}
      />
    </SessionProvider>
  );
}

function PageLoader() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-brandNavy border-t-transparent"
        aria-label="Loading"
      />
    </div>
  );
}
