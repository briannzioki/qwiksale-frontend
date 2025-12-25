"use client";
// src/app/components/ToasterClient.tsx

import { useEffect, useMemo, useState } from "react";
import { Toaster, toast, type ToasterProps, type DefaultToastOptions } from "react-hot-toast";
import { usePathname } from "next/navigation";

type Props = {
  /** If true, dismiss all toasts whenever the route changes. Default: true */
  dismissOnNavigate?: boolean;
  /** Position override; defaults to 'top-right' on desktop, 'top-center' on small screens */
  position?: ToasterProps["position"];
  /** Optional extra options to merge on top of theme defaults */
  extraToastOptions?: Partial<DefaultToastOptions>;
};

export default function ToasterClient({ dismissOnNavigate = true, position, extraToastOptions }: Props) {
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

  // Theme-aligned default styles
  const baseToastOptions: DefaultToastOptions = useMemo(
    () => ({
      duration: reducedMotion ? 2200 : 3200,
      className:
        "glass rounded-xl shadow-soft px-3 py-2 text-sm sm:text-[0.9rem] text-[var(--text)]",
      style: {
        lineHeight: 1.35,
        maxWidth: "min(calc(100vw - 1.5rem), 420px)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      },
      success: {
        duration: reducedMotion ? 1800 : 2600,
        className:
          "rounded-xl px-3 py-2 shadow-soft bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border-subtle)] text-sm sm:text-[0.9rem]",
        iconTheme: {
          // Use CSS vars to avoid hardcoded hex + keep theme-aligned
          primary: "var(--text)",
          secondary: "var(--bg)",
        } as any,
      },
      error: {
        duration: reducedMotion ? 2600 : 4200,
        className:
          "rounded-xl px-3 py-2 shadow-soft bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] text-sm sm:text-[0.9rem]",
        iconTheme: {
          primary: "var(--text)",
          secondary: "var(--bg)",
        } as any,
      },
      loading: {
        className:
          "glass rounded-xl px-3 py-2 shadow-soft text-sm sm:text-[0.9rem] text-[var(--text)] border border-[var(--border-subtle)]",
      },
    }),
    [reducedMotion],
  );

  // Merge safe overrides from the caller
  const mergedToastOptions: DefaultToastOptions = useMemo(() => {
    const extra = extraToastOptions ?? {};
    return {
      ...baseToastOptions,
      ...extra,
      success: { ...(baseToastOptions.success ?? {}), ...(extra.success ?? {}) },
      error: { ...(baseToastOptions.error ?? {}), ...(extra.error ?? {}) },
      loading: { ...(baseToastOptions.loading ?? {}), ...(extra.loading ?? {}) },
    };
  }, [baseToastOptions, extraToastOptions]);

  const resolvedPosition = position ?? autoPos;

  return (
    <Toaster
      {...(position ? { position } : { position: resolvedPosition })}
      gutter={10}
      reverseOrder={false}
      toastOptions={mergedToastOptions}
      containerStyle={{
        zIndex: 70, // z-toast
        inset: 10,
        pointerEvents: "none",
      }}
    />
  );
}

// Re-export the same toast instance for convenience across the app
export { toast } from "react-hot-toast";
