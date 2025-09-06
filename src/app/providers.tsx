"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { SessionProvider } from "next-auth/react";
import { Toaster, toast } from "react-hot-toast";
import { usePathname } from "next/navigation";

/* ----------------------------- Root Providers ----------------------------- */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <React.Suspense fallback={<PageLoader />}>
          <OnlineStatusWatcher />
          <PathChangeAnnouncer />
          {children}
        </React.Suspense>
      </Sentry.ErrorBoundary>

      <Toaster
        position="top-right"
        toastOptions={{
          className:
            "rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
          style: {
            borderRadius: "12px",
            padding: "10px 12px",
            background: "#ffffff",
            color: "#111827",
            boxShadow:
              "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
          },
          success: { style: { borderLeft: "4px solid #478559" } },
          error: { style: { borderLeft: "4px solid #f95d9b" } },
          loading: { style: { borderLeft: "4px solid #39a0ca" } },
        }}
      />
    </SessionProvider>
  );
}

/* ------------------------------- Fallback UI ------------------------------ */
function ErrorFallback() {
  // Keep this minimal; app-level errors will render this.
  return (
    <div className="grid min-h-[40vh] place-items-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400">
          We’ve been notified and are looking into it.
        </p>
        <button
          className="btn-primary"
          onClick={() => {
            // Best-effort: reload the current route
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

/* ------------------------------- Page Loader ------------------------------ */
function PageLoader() {
  return (
    <div
      className="grid min-h-[40vh] place-items-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="h-6 w-6 rounded-full border-2 border-brandNavy border-t-transparent motion-safe:animate-spin"
        aria-label="Loading"
      />
    </div>
  );
}

/* --------------------------- Online/Offline Toasts ------------------------ */
function OnlineStatusWatcher() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const onOffline = () =>
      toast.error("You’re offline. Some actions may not work.");
    const onOnline = () => toast.success("Back online");

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}

/* ----------------------- Screen Reader Route Announcer -------------------- */
function PathChangeAnnouncer() {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);
  // Skip the first render to avoid announcing on initial load.
  const label = mounted ? `Page changed: ${pathname || "/"}` : "";

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {label}
    </div>
  );
}
