// src/app/components/DevToolsMount.tsx
"use client";

import React, { useEffect, useMemo, useState, Suspense, useCallback } from "react";
import dynamic from "next/dynamic";

/**
 * Load only on the client, never on the server.
 * Provide a tiny skeleton to avoid layout jank when toggled on.
 */
const DevSentryTest = dynamic(() => import("./DevSentryTest"), {
  ssr: false,
  loading: () => (
    <div
      className="fixed bottom-4 right-4 z-[9999] rounded-lg border bg-white/90 dark:bg-zinc-900/90 px-3 py-2 text-xs shadow-md backdrop-blur"
      role="status"
      aria-live="polite"
    >
      Loading dev tools…
    </div>
  ),
});

/**
 * Decide whether dev tools should be visible.
 * Priority (highest → lowest):
 * 1) URL param ?dev=1 or ?dev=0  (ephemeral, overrides others for this session)
 * 2) sessionStorage key "qs:devtools" = "1" / "0" (sticky for the tab)
 * 3) localStorage  key "qs:devtools" = "1" / "0" (sticky across sessions)
 * 4) Env flags:
 *    - NEXT_PUBLIC_SHOW_DEV_TEST === "1" (force on)
 *    - NODE_ENV !== "production" (on by default in dev)
 */
function computeInitialShow(): boolean {
  if (typeof window === "undefined") {
    // During prerender (never happens here because "use client"), but be safe.
    return false;
  }

  try {
    const url = new URL(window.location.href);
    const qp = url.searchParams.get("dev");
    if (qp === "1") {
      sessionStorage.setItem("qs:devtools", "1");
      return true;
    }
    if (qp === "0") {
      sessionStorage.setItem("qs:devtools", "0");
      return false;
    }
  } catch {
    /* noop */
  }

  try {
    const ses = sessionStorage.getItem("qs:devtools");
    if (ses === "1") return true;
    if (ses === "0") return false;
  } catch {
    /* noop */
  }

  try {
    const ls = localStorage.getItem("qs:devtools");
    if (ls === "1") return true;
    if (ls === "0") return false;
  } catch {
    /* noop */
  }

  // Env-based defaults (inlined at build time)
  if (process.env["NEXT_PUBLIC_SHOW_DEV_TEST"] === "1") return true; // ← changed to dot-form
  return process.env.NODE_ENV !== "production";
}

/**
 * Small helper to store the preference.
 */
function persist(show: boolean) {
  try {
    sessionStorage.setItem("qs:devtools", show ? "1" : "0");
  } catch {}
  try {
    localStorage.setItem("qs:devtools", show ? "1" : "0");
  } catch {}
}

/**
 * Optional floating toggle button for quick on/off:
 * - Ctrl/⌘ + Shift + D toggles
 * - Also listens to window event "qs:devtools:toggle"
 */
export default function DevToolsMount() {
  const [show, setShow] = useState<boolean>(() => computeInitialShow());
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggle = useCallback(() => {
    setShow((prev) => {
      const next = !prev;
      persist(next);
      // eslint-disable-next-line no-console
      console.log("[qs:devtools]", next ? "enabled" : "disabled");
      return next;
    });
  }, []);

  // Keyboard: Ctrl/⌘ + Shift + D
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMeta = e.ctrlKey || e.metaKey;
      if (isMeta && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Event bus: window.dispatchEvent(new CustomEvent("qs:devtools:toggle"))
  useEffect(() => {
    function onToggle() {
      toggle();
    }
    window.addEventListener("qs:devtools:toggle", onToggle as EventListener);
    return () => window.removeEventListener("qs:devtools:toggle", onToggle as EventListener);
  }, [toggle]);

  // A tiny ribbon to indicate dev tools are active, with a click-to-hide.
  const Ribbon = useMemo(
    () =>
      show ? (
        <button
          type="button"
          onClick={toggle}
          title="Hide dev tools (Ctrl/⌘+Shift+D)"
          className="
            fixed bottom-4 right-4 z-[9998]
            rounded-full border px-3 py-2 text-xs font-semibold
            bg-white/90 text-gray-900 dark:bg-zinc-900/90 dark:text-zinc-100
            border-gray-200 dark:border-zinc-800 shadow-md backdrop-blur
            hover:bg-white dark:hover:bg-zinc-800 transition
          "
        >
          Dev tools ON
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          title="Show dev tools (Ctrl/⌘+Shift+D)"
          className="
            fixed bottom-4 right-4 z-[9998]
            rounded-full border px-3 py-2 text-xs
            bg-white/70 text-gray-700 dark:bg-zinc-900/70 dark:text-zinc-300
            border-gray-200 dark:border-zinc-800 shadow-sm backdrop-blur
            hover:bg-white dark:hover:bg-zinc-800 transition
          "
        >
          Dev tools OFF
        </button>
      ),
    [show, toggle]
  );

  // Guard against SSR hydration: only render after mount
  if (!mounted) return null;

  return (
    <>
      {Ribbon}
      {show ? (
        <Suspense fallback={null}>
          <DevSentryTest />
        </Suspense>
      ) : null}
    </>
  );
}
