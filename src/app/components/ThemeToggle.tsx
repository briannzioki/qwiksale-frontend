// src/app/components/ThemeToggle.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ThemeMode = "light" | "dark" | "system";
const LS_KEY = "theme";
const prefersDarkQuery = "(prefers-color-scheme: dark)";

function isDarkFor(mode: ThemeMode, mql: MediaQueryList | null) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return !!mql?.matches; // system
}

function applyTheme(mode: ThemeMode, mql: MediaQueryList | null) {
  const dark = isDarkFor(mode, mql);
  const root = document.documentElement;

  // Tailwind "dark" strategy
  root.classList.toggle("dark", dark);

  // Optional: help native form controls match
  root.style.colorScheme = dark ? ("dark" as const) : ("light" as const);

  // Persist choice
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {}
}

export default function ThemeToggle({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("system");
  const mqlRef = useRef<MediaQueryList | null>(null);

  // Determine the next mode when clicking the button (cycles: light → dark → system)
  const nextMode = useMemo<ThemeMode>(() => {
    if (mode === "light") return "dark";
    if (mode === "dark") return "system";
    return "light";
  }, [mode]);

  const label = useMemo(() => {
    if (mode === "light") return "Light";
    if (mode === "dark") return "Dark";
    return "System";
  }, [mode]);

  useEffect(() => {
    setMounted(true);

    // Init MediaQueryList for system detection
    const mql = window.matchMedia(prefersDarkQuery);
    mqlRef.current = mql;

    // Bootstrap from localStorage (matches the inline script in layout.tsx)
    let initial: ThemeMode = "system";
    try {
      const saved = (localStorage.getItem(LS_KEY) || "").toLowerCase();
      if (saved === "light" || saved === "dark" || saved === "system") initial = saved as ThemeMode;
    } catch {}

    setMode(initial);
    applyTheme(initial, mql);

    // React to OS theme changes when in "system" mode
    const onSystemChange = () => {
      if (mode === "system") applyTheme("system", mqlRef.current);
    };
    mql.addEventListener?.("change", onSystemChange);

    // Keep multiple tabs in sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) {
        const v = e.newValue as ThemeMode;
        if (v === "light" || v === "dark" || v === "system") {
          setMode(v);
          applyTheme(v, mqlRef.current);
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mql.removeEventListener?.("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClick() {
    const next = nextMode;
    setMode(next);
    applyTheme(next, mqlRef.current);
  }

  // Hydration-safe placeholder
  if (!mounted) {
    return (
      <button
        aria-hidden
        className={`rounded-xl p-2 transition hover:bg-white/20 ${className}`}
        title="Toggle theme"
      >
        {/* simple dot while hydrating */}
        <span className="inline-block w-2 h-2 rounded-full bg-white/70" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-2 rounded-xl p-2 text-sm transition hover:bg-white/20 ${className}`}
      aria-label={`Theme: ${label}. Click to switch to ${nextMode}.`}
      title={`Theme: ${label} — click to switch to ${nextMode}`}
    >
      {/* Icon for current mode */}
      {mode === "dark" ? (
        // Sun (indicates clicking will go to light? we show current state icon; label explains next)
        <svg width="20" height="20" viewBox="0 0 24 24" className="text-yellow-300" fill="none">
          <path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.64 5.64L4.22 4.22M19.78 19.78l-1.42-1.42M5.64 18.36l-1.42 1.42M19.78 4.22l-1.42 1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ) : mode === "light" ? (
        // Moon
        <svg width="20" height="20" viewBox="0 0 24 24" className="text-slate-200" fill="none">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" fill="currentColor"/>
        </svg>
      ) : (
        // Laptop (system)
        <svg width="20" height="20" viewBox="0 0 24 24" className="text-white/90" fill="none">
          <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M2 20h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )}
      {showLabel && <span className="select-none">{label}</span>}
    </button>
  );
}
