"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";

/**
 * Dev tools toggle — strictly passive (no URL/history mutations).
 */
function computeInitialShow(): boolean {
  if (typeof window === "undefined") return false;

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
  } catch {}

  try {
    const ses = sessionStorage.getItem("qs:devtools");
    if (ses === "1") return true;
    if (ses === "0") return false;
  } catch {}

  try {
    const ls = localStorage.getItem("qs:devtools");
    if (ls === "1") return true;
    if (ls === "0") return false;
  } catch {}

  if (process.env["NEXT_PUBLIC_SHOW_DEV_TEST"] === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function persist(show: boolean) {
  try {
    sessionStorage.setItem("qs:devtools", show ? "1" : "0");
  } catch {}
  try {
    localStorage.setItem("qs:devtools", show ? "1" : "0");
  } catch {}
}

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

  useEffect(() => {
    function onToggle() {
      toggle();
    }
    window.addEventListener("qs:devtools:toggle", onToggle as EventListener);
    return () => window.removeEventListener("qs:devtools:toggle", onToggle as EventListener);
  }, [toggle]);

  const Ribbon = useMemo(
    () =>
      show ? (
        <button
          type="button"
          onClick={toggle}
          title="Hide dev tools (Ctrl/⌘+Shift+D)"
          className="fixed bottom-4 right-4 z-[9998] rounded-full border px-3 py-2 text-xs font-semibold bg-white/90 text-gray-900 dark:bg-zinc-900/90 dark:text-zinc-100 border-gray-200 dark:border-zinc-800 shadow-md backdrop-blur hover:bg-white dark:hover:bg-zinc-800 transition"
        >
          Dev tools ON
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          title="Show dev tools (Ctrl/⌘+Shift+D)"
          className="fixed bottom-4 right-4 z-[9998] rounded-full border px-3 py-2 text-xs bg-white/70 text-gray-700 dark:bg-zinc-900/70 dark:text-zinc-300 border-gray-200 dark:border-zinc-800 shadow-sm backdrop-blur hover:bg-white dark:hover:bg-zinc-800 transition"
        >
          Dev tools OFF
        </button>
      ),
    [show, toggle]
  );

  if (!mounted) return null;
  return <>{Ribbon}</>;
}
