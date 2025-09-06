// src/app/components/ToasterClient.tsx
"use client";

import { useEffect } from "react";
import { Toaster, toast } from "react-hot-toast";
import { usePathname } from "next/navigation";

type Props = {
  /** If true, dismiss all toasts whenever the route changes. Default: true */
  dismissOnNavigate?: boolean;
  /** Position override; defaults to 'top-right' on desktop, 'top-center' on small screens */
  position?: React.ComponentProps<typeof Toaster>["position"];
};

export default function ToasterClient({
  dismissOnNavigate = true,
  position,
}: Props) {
  const pathname = usePathname();

  // Dismiss on navigation (prevents stale success/error messages sticking around)
  useEffect(() => {
    if (!dismissOnNavigate) return;
    toast.dismiss();
  }, [pathname, dismissOnNavigate]);

  // Respect reduced motion: shorten durations & disable fancy transition
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  return (
    <Toaster
      // On phones, top-center feels nicer; desktop top-right by default
      position={position ?? (typeof window !== "undefined" && window.innerWidth < 640 ? "top-center" : "top-right")}
      gutter={8}
      reverseOrder={false}
      toastOptions={{
        duration: prefersReducedMotion ? 2000 : 3000,
        className:
          "rounded-xl border shadow-lg px-3 py-2 bg-white text-gray-900 border-gray-200 " +
          "dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800",
        style: {
          fontSize: "0.875rem",
          lineHeight: 1.4,
          // keep wide enough for multi-line messages but not too wide
          maxWidth: "min(calc(100vw - 2rem), 420px)",
        },
        // variants
        success: {
          duration: prefersReducedMotion ? 1800 : 2500,
          className:
            "rounded-xl border shadow-lg px-3 py-2 " +
            "bg-emerald-50 text-emerald-900 border-emerald-200 " +
            "dark:bg-emerald-900/20 dark:text-emerald-50 dark:border-emerald-800",
          iconTheme: { primary: "#10b981", secondary: "#ffffff" },
        },
        error: {
          duration: prefersReducedMotion ? 2500 : 4000,
          className:
            "rounded-xl border shadow-lg px-3 py-2 " +
            "bg-rose-50 text-rose-900 border-rose-200 " +
            "dark:bg-rose-900/20 dark:text-rose-50 dark:border-rose-800",
          iconTheme: { primary: "#ef4444", secondary: "#ffffff" },
        },
        loading: {
          className:
            "rounded-xl border shadow-lg px-3 py-2 " +
            "bg-white text-gray-900 border-gray-200 " +
            "dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800",
        },
      }}
      containerStyle={{
        zIndex: 60,
        inset: 12, // breathing room from edges
        pointerEvents: "none", // clicks pass through gaps
      }}
    />
  );
}
