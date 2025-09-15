// src/app/components/ToasterClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Toaster,
  toast,
  type ToasterProps,
  type DefaultToastOptions,
} from "react-hot-toast";
import { usePathname } from "next/navigation";

type Props = {
  /** If true, dismiss all toasts whenever the route changes. Default: true */
  dismissOnNavigate?: boolean;
  /** Position override; defaults to 'top-right' on desktop, 'top-center' on small screens */
  position?: ToasterProps["position"];
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

  // Track prefers-reduced-motion (live)
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Choose position responsively; update on resize
  const [autoPos, setAutoPos] = useState<NonNullable<ToasterProps["position"]>>(() => {
    if (typeof window === "undefined") return "top-right";
    return window.innerWidth < 640 ? "top-center" : "top-right";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setAutoPos(window.innerWidth < 640 ? "top-center" : "top-right");
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Ensure this is ALWAYS defined (fix for exactOptionalPropertyTypes)
  const toastOptions: DefaultToastOptions = useMemo(
    () => ({
      duration: reducedMotion ? 2000 : 3000,
      className:
        "rounded-xl border shadow-lg px-3 py-2 bg-white text-gray-900 border-gray-200 " +
        "dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800",
      style: {
        fontSize: "0.875rem",
        lineHeight: 1.4,
        maxWidth: "min(calc(100vw - 2rem), 420px)",
      },
      success: {
        duration: reducedMotion ? 1800 : 2500,
        className:
          "rounded-xl border shadow-lg px-3 py-2 " +
          "bg-emerald-50 text-emerald-900 border-emerald-200 " +
          "dark:bg-emerald-900/20 dark:text-emerald-50 dark:border-emerald-800",
        iconTheme: { primary: "#10b981", secondary: "#ffffff" },
      },
      error: {
        duration: reducedMotion ? 2500 : 4000,
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
    }),
    [reducedMotion]
  );

  const resolvedPosition = position ?? autoPos;

  return (
    <Toaster
      // Also avoid passing an undefined position (fix for exactOptionalPropertyTypes)
      {...(position ? { position } : { position: resolvedPosition })}
      gutter={8}
      reverseOrder={false}
      toastOptions={toastOptions}
      containerStyle={{
        zIndex: 60,
        inset: 12, // breathing room from edges
        pointerEvents: "none", // clicks pass through gaps
      }}
    />
  );
}
